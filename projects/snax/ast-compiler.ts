import * as AST from './snax-ast';
import { SNAXParser } from './snax-parser';
import { Intrinsics, NumericalType } from './snax-types';
import * as IR from './stack-ir';
import * as Wasm from './wasm-ast';

export abstract class ASTCompiler<
  Root extends AST.ASTNode = AST.ASTNode,
  Output = IR.Instruction[]
> {
  root: Root;
  parent?: ASTCompiler<AST.ASTNode, unknown>;

  constructor(
    root: Root,
    parent: ASTCompiler<AST.ASTNode, unknown> | undefined
  ) {
    this.root = root;
    this.parent = parent;
  }

  abstract compile(): Output;

  protected forNode(node: AST.ASTNode): ASTCompiler {
    if (node instanceof AST.Expression) {
      return new ExpressionCompiler(node, this);
    } else if (node instanceof AST.ExprStatement) {
      return new ExprStatementCompiler(node, this);
    } else if (node instanceof AST.NumberLiteral) {
      return new NumberLiteralCompiler(node, this);
    } else if (node instanceof AST.Block) {
      return new BlockCompiler(node, this);
    } else if (node instanceof AST.LetStatement) {
      return new LetStatementCompiler(node, this);
    } else if (node instanceof AST.IfStatement) {
      return new IfStatementCompiler(node, this);
    } else if (node instanceof AST.SymbolRef) {
      return new SymbolRefCompiler(node, this);
    } else if (node instanceof AST.BooleanLiteral) {
      return new BooleanLiteralCompiler(node, this);
    } else if (node instanceof AST.ArrayLiteral) {
      return new ArrayLiteralCompiler(node, this);
    } else if (node instanceof AST.ArgList) {
      return new ArgListCompiler(node, this);
    } else if (node instanceof AST.WhileStatement) {
      return new WhileStatementCompiler(node, this);
    } else if (node instanceof AST.ReturnStatement) {
      return new ReturnStatementCompiler(node, this);
    } else if (node instanceof AST.UnaryExpr) {
      return new UnaryExprCompiler(node, this);
    } else {
      throw new Error(
        `ASTCompiler: No compiler available for node ${node.toString()}`
      );
    }
  }

  compileChild(child: AST.ASTNode) {
    return this.forNode(child).compile();
  }

  allocateLocal(valueType: IR.NumberType, symbol?: string): LocalAllocation {
    if (!this.parent) {
      throw new Error("Don't know how to allocate local in this context");
    }
    return this.parent.allocateLocal(valueType, symbol);
  }
  deallocateLocal(offset: LocalAllocation): void {
    if (!this.parent) {
      throw new Error("Don't know how to deallocate local in this context");
    }
    return this.parent.deallocateLocal(offset);
  }
}

class ReturnStatementCompiler extends ASTCompiler<AST.ReturnStatement> {
  compile() {
    return [
      ...(this.root.expr ? this.forNode(this.root.expr).compile() : []),
      new IR.Return(),
    ];
  }
}

export class BlockCompiler extends ASTCompiler<AST.Block> {
  liveLocals: LocalAllocation[] = [];
  override allocateLocal(
    valueType: IR.NumberType,
    symbol?: string
  ): LocalAllocation {
    if (!this.parent) {
      throw new Error("BlockCompiler: can't allocate local in this context");
    }
    let localOffset = this.parent.allocateLocal(valueType);
    this.liveLocals.push(localOffset);
    if (symbol && this.root.symbolTable) {
      let symbolRecord = this.root.symbolTable.get(symbol);
      if (symbolRecord) {
        symbolRecord.location = { area: 'locals', offset: localOffset.offset };
      } else {
        throw new Error(
          `BlockCompiler: Can't bind local offset to undeclared symbol ${symbol}`
        );
      }
    }
    return localOffset;
  }

  override deallocateLocal(offset: LocalAllocation): void {
    this.parent?.deallocateLocal(offset);
    this.liveLocals = this.liveLocals.filter((o) => o !== offset);
  }

  compile(): IR.Instruction[] {
    const code = this.root.statements
      .filter((astNode) => !(astNode instanceof AST.FuncDecl))
      .map((astNode) => this.forNode(astNode).compile())
      .flat();
    for (const offset of this.liveLocals) {
      this.parent?.deallocateLocal(offset);
    }
    return code;
  }
}

export function resolveSymbols(file: AST.File) {
  if (file.symbolTable) {
    throw new Error('resolveSymbols: Already resolved symbols for block...');
  }
  file.symbolTable = new AST.SymbolTable();

  for (const funcDecl of file.funcDecls) {
    file.symbolTable.declare(funcDecl.symbol, funcDecl);
  }

  for (const globalDecl of file.globalDecls) {
    file.symbolTable.declare(globalDecl.symbol, globalDecl);
  }

  const scopes: AST.SymbolTable[] = [file.symbolTable];

  function recurse(astNode: AST.ASTNode) {
    const currentScope = scopes[scopes.length - 1];
    if (astNode instanceof AST.Block) {
      astNode.symbolTable = new AST.SymbolTable(currentScope);
      scopes.push(astNode.symbolTable);
      for (const child of astNode.children) {
        recurse(child);
      }
      scopes.pop();
      return;
    } else if (astNode instanceof AST.FuncDecl) {
      astNode.symbolTable = new AST.SymbolTable(currentScope);
      scopes.push(astNode.symbolTable);
      astNode.children.forEach(recurse);
      scopes.pop();
      return;
    }
    astNode.children.forEach(recurse);
    if (astNode instanceof AST.Parameter) {
      if (currentScope.has(astNode.symbol)) {
        throw new Error(`Redeclaration of parameter ${astNode.symbol}`);
      }
      currentScope.declare(astNode.symbol, astNode);
    } else if (astNode instanceof AST.LetStatement) {
      if (currentScope.has(astNode.symbol)) {
        throw new Error(
          `Redeclaration of symbol ${astNode.symbol} in the same scope`
        );
      }
      currentScope.declare(astNode.symbol, astNode);
    } else if (astNode instanceof AST.SymbolRef) {
      const symbolRecord = currentScope.get(astNode.symbol);
      if (!symbolRecord) {
        throw new Error(`Reference to undeclared symbol ${astNode.symbol}`);
      }
      astNode.symbolRecord = symbolRecord;
    }
  }
  recurse(file);
}

export type ModuleCompilerOptions = {
  includeRuntime?: boolean;
  includeWASI?: boolean;
};
export class ModuleCompiler extends ASTCompiler<AST.File, Wasm.Module> {
  file: AST.File;
  options: Required<ModuleCompilerOptions>;
  constructor(file: AST.File, options?: ModuleCompilerOptions) {
    super(file, undefined);
    this.file = file;
    this.options = {
      includeRuntime: false,
      includeWASI: false,
      ...options,
    };
  }
  compile(): Wasm.Module {
    if (this.options.includeRuntime) {
      let runtimeAST = SNAXParser.parseStrOrThrow(`
        global next = 0;
        func malloc(numBytes:i32) {
          let startAddress = next;
          next = next + numBytes;
          return startAddress;
        }`);
      this.file.children.push(
        ...runtimeAST.children.filter(
          (node) => !(node instanceof AST.FuncDecl && node.symbol === 'main')
        )
      );
    }

    resolveSymbols(this.file);
    let funcOffset = 0;
    let globalOffset = 0;
    for (const record of this.file.symbolTable!.records()) {
      if (record.declNode instanceof AST.FuncDecl) {
        record.location = { area: 'funcs', offset: funcOffset++ };
      } else if (record.declNode instanceof AST.GlobalDecl) {
        record.location = { area: 'globals', offset: globalOffset++ };
      }
    }

    const funcs: Wasm.Func[] = this.file.funcDecls.map((func) => {
      const wasmFunc = new FuncDeclCompiler(func).compile();
      if (func.symbol === 'main') {
        wasmFunc.fields.exportName = '_start';
      }
      return wasmFunc;
    });

    const globals: Wasm.Global[] = this.file.globalDecls.map((global, i) => {
      return new Wasm.Global({
        id: `g${i}`,
        globalType: new Wasm.GlobalType({
          valtype: global.resolveType().toValueType(),
          mut: true,
        }),
        expr: this.compileChild(global.expr),
      });
    });

    return new Wasm.Module({
      funcs,
      globals,
    });
  }
}

type LocalAllocation = {
  offset: number;
  live: boolean;
  local: Wasm.Local;
};

export class FuncDeclCompiler extends ASTCompiler<AST.FuncDecl, Wasm.Func> {
  funcDecl: AST.FuncDecl;
  locals: LocalAllocation[] = [];

  private localsOffset = 0;

  constructor(funcDecl: AST.FuncDecl) {
    super(funcDecl, undefined);
    this.funcDecl = funcDecl;
  }

  override allocateLocal(valueType: IR.NumberType): LocalAllocation {
    let freeLocal = this.locals.find(
      (l) => !l.live && l.local.fields.valueType === valueType
    );
    if (freeLocal) {
      freeLocal.live = true;
      return freeLocal;
    } else {
      let localAllocation = {
        offset: this.localsOffset++,
        live: true,
        local: new Wasm.Local(valueType),
      };
      this.locals.push(localAllocation);
      return localAllocation;
    }
  }

  override deallocateLocal(offset: LocalAllocation): void {
    let local = this.locals.find((l) => l === offset);
    if (!local) {
      throw new Error(
        "FuncDeclCompiler: can't deallocate local that was never allocated..."
      );
    }
    local.live = false;
  }

  compile(): Wasm.Func {
    const funcType = this.funcDecl.resolveType();
    const params = funcType.argTypes.map((t) => t.toValueType());
    for (const param of this.root.parameters) {
      param.location = { area: 'locals', offset: this.localsOffset++ };
      if (this.root.symbolTable) {
        this.root.symbolTable.get(param.symbol)!.location = param.location;
      }
    }

    const results =
      funcType.returnType === Intrinsics.void
        ? []
        : [funcType.returnType.toValueType()];

    return new Wasm.Func({
      id: this.funcDecl.symbol,
      body: this.compileChild(this.funcDecl.block),
      funcType: new Wasm.FuncType({
        params,
        results,
      }),
      locals: this.locals.map((l) => l.local),
    });
  }
}

class LetStatementCompiler extends ASTCompiler<AST.LetStatement> {
  compile(): IR.Instruction[] {
    let localAllocation = this.allocateLocal(
      this.root.resolveType().toValueType(),
      this.root.symbol
    );
    this.root.location = { area: 'locals', offset: localAllocation.offset };
    return [
      ...this.forNode(this.root.expr).compile(),
      new IR.LocalSet(localAllocation.offset),
    ];
  }
}

export class IfStatementCompiler extends ASTCompiler<AST.IfStatement> {
  compile(): IR.Instruction[] {
    return [
      ...this.forNode(this.root.condExpr).compile(),
      new Wasm.IfBlock({
        then: this.forNode(this.root.thenBlock).compile(),
        else: this.forNode(this.root.elseBlock).compile(),
      }),
    ];
  }
}

export class WhileStatementCompiler extends ASTCompiler<AST.WhileStatement> {
  compile() {
    return [
      ...this.compileChild(this.root.condExpr),
      new Wasm.IfBlock({
        then: [
          new Wasm.LoopBlock({
            instr: [
              ...this.compileChild(this.root.thenBlock),
              ...this.compileChild(this.root.condExpr),
              new IR.BreakIf('while_0'),
            ],
            label: 'while_0',
          }),
        ],
        else: [],
      }),
    ];
  }
}

class SymbolRefCompiler extends ASTCompiler<AST.SymbolRef> {
  compile(): IR.Instruction[] {
    const location = this.root.symbolRecord?.location;
    if (!location) {
      throw new Error(
        `SymbolRefCompiler: Can't compile reference to unlocated symbol ${this.root.symbol}`
      );
    }
    switch (location.area) {
      case 'locals':
        return [new IR.LocalGet(location.offset)];
      case 'globals':
        return [new IR.GlobalGet(location.offset)];
      default:
        throw new Error(
          `SymbolRefCompiler: don't know how to compile reference to a location in ${location.area}`
        );
    }
  }
}

function convert(child: AST.ASTNode, targetType: IR.NumberType) {
  const childType = child.resolveType().toValueType();
  if (childType === targetType) {
    return [];
  }
  if (IR.isIntType(childType) && IR.isFloatType(targetType)) {
    return [new IR.Convert(childType, targetType)];
  }
  throw new Error(`Can't convert from a ${childType} to a ${targetType}`);
}

function matchTypes(left: AST.ASTNode, right: AST.ASTNode) {
  const leftType = left.resolveType();
  const rightType = right.resolveType();
  let targetType = leftType;
  if (leftType instanceof NumericalType && rightType instanceof NumericalType) {
    if (rightType.interpretation === 'float') {
      targetType = rightType;
    }
  } else if (leftType === Intrinsics.bool && rightType === Intrinsics.bool) {
  } else {
    throw new Error("pushNumberOps: don't know how to cast to number");
  }
  return targetType.toValueType();
}

export class ExpressionCompiler extends ASTCompiler<AST.Expression> {
  static forNode(root: AST.Expression) {
    return new ExpressionCompiler(root, undefined);
  }
  private pushNumberOps(left: AST.ASTNode, right: AST.ASTNode) {
    let targetType = matchTypes(left, right);
    return [
      ...this.forNode(left).compile(),
      ...convert(left, targetType),
      ...this.forNode(right).compile(),
      ...convert(right, targetType),
    ];
  }

  private OpCompilers: Record<
    AST.BinaryOp,
    (left: AST.ASTNode, right: AST.ASTNode) => IR.Instruction[]
  > = {
    [AST.BinaryOp.ADD]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.Add(matchTypes(left, right)),
    ],
    [AST.BinaryOp.SUB]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.Sub(matchTypes(left, right)),
    ],
    [AST.BinaryOp.MUL]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.Mul(matchTypes(left, right)),
    ],
    [AST.BinaryOp.DIV]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.Div(matchTypes(left, right)),
    ],
    [AST.BinaryOp.EQUAL_TO]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.Equal(matchTypes(left, right)),
    ],
    [AST.BinaryOp.NOT_EQUAL_TO]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.NotEqual(matchTypes(left, right)),
    ],
    [AST.BinaryOp.LESS_THAN]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.LessThan(matchTypes(left, right)),
    ],
    [AST.BinaryOp.GREATER_THAN]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.GreaterThan(matchTypes(left, right)),
    ],
    [AST.BinaryOp.LOGICAL_AND]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.forNode(left).compile(),
      ...this.forNode(right).compile(),
      new IR.And(Intrinsics.bool.toValueType()),
    ],
    [AST.BinaryOp.LOGICAL_OR]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.forNode(left).compile(),
      ...this.forNode(right).compile(),
      new IR.Or(Intrinsics.bool.toValueType()),
    ],
    [AST.BinaryOp.ASSIGN]: (left: AST.ASTNode, right: AST.ASTNode) => {
      const leftType = left.resolveType();
      const rightType = right.resolveType();
      if (leftType !== rightType) {
        throw new Error(
          `Can't assign value of type ${rightType} to symbol of type ${leftType}`
        );
      }
      if (left instanceof AST.SymbolRef) {
        const location = left.symbolRecord?.location;
        if (!location) {
          throw new Error(
            `ASSIGN: can't compile assignment to unlocated symbol ${left.symbol}`
          );
        }
        switch (location.area) {
          case 'locals':
            return [
              ...this.forNode(right).compile(),
              new IR.LocalTee(location.offset),
            ];
          case 'globals':
            return [
              ...this.compileChild(right),
              new IR.GlobalSet(location.offset),
              new IR.GlobalGet(location.offset),
            ];
          default:
            throw new Error(
              `ASSIGN: don't know how to compile assignment to symbol located in ${location.area}`
            );
        }
      } else if (
        left instanceof AST.UnaryExpr &&
        left.op === AST.UnaryOp.DEREF
      ) {
        let setup = [
          ...this.compileChild(left.expr),
          ...this.compileChild(right),
        ];
        let tempOffset = this.allocateLocal(right.resolveType().toValueType());
        this.deallocateLocal(tempOffset);
        return [
          ...setup,
          new IR.LocalTee(tempOffset.offset),
          new IR.MemoryStore(rightType.toValueType()),
          new IR.LocalGet(tempOffset.offset),
        ];
      } else if (
        left instanceof AST.Expression &&
        left.op === AST.BinaryOp.ARRAY_INDEX
      ) {
        let valueType = leftType.toValueType();
        const arrayExpr = left;
        let calcPointer = [
          ...this.compileChild(arrayExpr.left),
          ...this.compileChild(arrayExpr.right),
          new IR.PushConst(valueType, leftType.numBytes),
          new IR.Mul(valueType),
          new IR.Add(valueType),
        ];
        let calcValue = this.compileChild(right);
        let tempOffset = this.allocateLocal(right.resolveType().toValueType());
        this.deallocateLocal(tempOffset);
        return [
          ...calcPointer,
          ...calcValue,
          new IR.LocalTee(tempOffset.offset),
          new IR.MemoryStore(valueType, 0, leftType.numBytes),
          new IR.LocalGet(tempOffset.offset),
        ];
      } else {
        throw new Error(
          `ASSIGN: Can't assign to something that is not a resolved symbol or a memory address`
        );
      }
    },
    [AST.BinaryOp.ARRAY_INDEX]: (
      refExpr: AST.ASTNode,
      indexExpr: AST.ASTNode
    ) => {
      const valueType = refExpr.resolveType().toValueType();
      return [
        ...this.forNode(refExpr).compile(),
        ...this.forNode(indexExpr).compile(),
        new IR.Add(valueType),
        new IR.PushConst(valueType, 4),
        new IR.Mul(valueType),
        new IR.MemoryLoad(refExpr.resolveType().toValueType(), 0),
      ];
    },
    [AST.BinaryOp.CALL]: (left: AST.ASTNode, right: AST.ASTNode) => {
      if (left instanceof AST.SymbolRef) {
        const location = left.symbolRecord?.location;
        if (!location || location.area !== 'funcs') {
          throw new Error(`CALL: can't call unlocated function ${left.symbol}`);
        }
        return [...this.forNode(right).compile(), new IR.Call(location.offset)];
      } else {
        throw new Error(
          `ExpressionCompiler: Can't call unresolved symbol ${left}`
        );
      }
    },
  };
  compile(): IR.Instruction[] {
    return this.OpCompilers[this.root.op](this.root.left, this.root.right);
  }
}

class UnaryExprCompiler extends ASTCompiler<AST.UnaryExpr> {
  compile() {
    switch (this.root.op) {
      case AST.UnaryOp.DEREF:
        const exprType = this.root.expr.resolveType();
        return [
          ...this.compileChild(this.root.expr),
          new IR.MemoryLoad(exprType.toValueType()),
        ];
    }
  }
}

class ExprStatementCompiler extends ASTCompiler<AST.ExprStatement> {
  compile() {
    if (this.root.expr.resolveType() === Intrinsics.void) {
      return this.compileChild(this.root.expr);
    }
    return [...this.compileChild(this.root.expr), new IR.Drop()];
  }
}

class ArgListCompiler extends ASTCompiler<AST.ArgList> {
  compile() {
    return this.root.children
      .map((child) => this.forNode(child).compile())
      .flat();
  }
}

class NumberLiteralCompiler extends ASTCompiler<AST.NumberLiteral> {
  compile(): IR.Instruction[] {
    const valueType = this.root.resolveType().toValueType();
    return [new IR.PushConst(valueType, this.root.value)];
  }
}

export class BooleanLiteralCompiler extends ASTCompiler<AST.BooleanLiteral> {
  compile(): IR.Instruction[] {
    const value = this.root.value ? 1 : 0;
    return [new IR.PushConst(IR.NumberType.i32, value)];
  }
}

class ArrayLiteralCompiler extends ASTCompiler<AST.ArrayLiteral> {
  compile(): IR.Instruction[] {
    const arrayType = this.root.resolveType();
    // TODO: this should not be zero, otherwise every array literal
    // will overwrite the other array literals...
    const baseAddressInstr = new IR.PushConst(IR.NumberType.i32, 0);
    const instr: IR.Instruction[] = [
      ...this.root.children.map((child, i) => [
        // push memory space offset
        baseAddressInstr,
        // push value from expression
        ...this.forNode(child).compile(),
        // store value
        new IR.MemoryStore(arrayType.elementType.toValueType(), i * 4, 4),
      ]),
    ].flat();
    instr.push(baseAddressInstr);
    return instr;
  }
}
