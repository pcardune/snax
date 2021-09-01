import * as AST from './snax-ast';
import { SNAXParser } from './snax-parser';
import { Intrinsics, NumericalType } from './snax-types';
import * as IR from './stack-ir';
import * as Wasm from './wasm-ast';

export abstract class ASTCompiler<Root extends AST.ASTNode = AST.ASTNode> {
  root: Root;
  constructor(root: Root) {
    this.root = root;
  }

  abstract compile(): IR.Instruction[];

  static forNode(node: AST.ASTNode): ASTCompiler {
    if (node instanceof AST.Expression) {
      return new ExpressionCompiler(node);
    } else if (node instanceof AST.ExprStatement) {
      return new ExprStatementCompiler(node);
    } else if (node instanceof AST.NumberLiteral) {
      return new NumberLiteralCompiler(node);
    } else if (node instanceof AST.Block) {
      return new BlockCompiler(node);
    } else if (node instanceof AST.LetStatement) {
      return new LetStatementCompiler(node);
    } else if (node instanceof AST.IfStatement) {
      return new IfStatementCompiler(node);
    } else if (node instanceof AST.SymbolRef) {
      return new SymbolRefCompiler(node);
    } else if (node instanceof AST.BooleanLiteral) {
      return new BooleanLiteralCompiler(node);
    } else if (node instanceof AST.ArrayLiteral) {
      return new ArrayLiteralCompiler(node);
    } else if (node instanceof AST.ArgList) {
      return new ArgListCompiler(node);
    } else if (node instanceof AST.WhileStatement) {
      return new WhileStatementCompiler(node);
    } else if (node instanceof AST.ReturnStatement) {
      return new ReturnStatementCompiler(node);
    } else {
      throw new Error(
        `ASTCompiler: No compiler available for node ${node.toString()}`
      );
    }
  }
}

export function compile(node: AST.ASTNode) {
  return ASTCompiler.forNode(node).compile();
}

class ReturnStatementCompiler extends ASTCompiler<AST.ReturnStatement> {
  compile() {
    return [
      ...(this.root.expr ? ASTCompiler.forNode(this.root.expr).compile() : []),
      new IR.Return(),
    ];
  }
}

export class BlockCompiler extends ASTCompiler<AST.Block> {
  compile(): IR.Instruction[] {
    return this.root.statements
      .filter((astNode) => !(astNode instanceof AST.FuncDecl))
      .map((astNode) => ASTCompiler.forNode(astNode).compile())
      .flat();
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

export function assignStorageLocations(file: AST.File) {
  function recurse(funcDecl: AST.FuncDecl, astNode: AST.ASTNode) {
    if (astNode instanceof AST.Block || astNode instanceof AST.FuncDecl) {
      for (const record of astNode.symbolTable!.records()) {
        if (
          record.declNode instanceof AST.LetStatement ||
          record.declNode instanceof AST.Parameter
        ) {
          funcDecl.locals?.push(record);
          record.location = {
            area: 'locals',
            offset: funcDecl.locals?.length - 1,
          };
          record.declNode.location = record.location;
          record.valueType = record.declNode.resolveType();
        }
      }
    }
    astNode.children.forEach((child) => recurse(funcDecl, child));
  }
  let funcOffset = 0;
  let globalOffset = 0;
  for (const record of file.symbolTable!.records()) {
    if (record.declNode instanceof AST.FuncDecl) {
      record.declNode.locals = [];
      record.location = { area: 'funcs', offset: funcOffset++ };
      recurse(record.declNode, record.declNode);
    } else if (record.declNode instanceof AST.GlobalDecl) {
      record.location = { area: 'globals', offset: globalOffset++ };
    }
  }
}

export type ModuleCompilerOptions = {
  includeRuntime: boolean;
};
export class ModuleCompiler {
  file: AST.File;
  options: ModuleCompilerOptions;
  constructor(file: AST.File, options?: Partial<ModuleCompilerOptions>) {
    this.file = file;
    this.options = {
      includeRuntime: false,
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
    assignStorageLocations(this.file);

    const funcs: Wasm.Func[] = this.file.funcDecls.map((func) => {
      const wasmFunc = new FuncDeclCompiler(func).compile();
      if (func.symbol === 'main') {
        wasmFunc.fields.exportName = 'main';
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
        expr: compile(global.expr),
      });
    });

    return new Wasm.Module({
      funcs,
      globals,
    });
  }
}

export class FuncDeclCompiler {
  funcDecl: AST.FuncDecl;
  constructor(funcDecl: AST.FuncDecl) {
    this.funcDecl = funcDecl;
  }
  compile(): Wasm.Func {
    const funcType = this.funcDecl.resolveType();
    const params = funcType.argTypes.map((t) => t.toValueType());
    const results =
      funcType.returnType === Intrinsics.Void
        ? []
        : [funcType.returnType.toValueType()];

    const locals: Wasm.Local[] = [];
    for (const local of this.funcDecl.locals) {
      locals.push(new Wasm.Local(local.declNode.resolveType().toValueType()));
    }
    return new Wasm.Func({
      id: this.funcDecl.symbol,
      body: ASTCompiler.forNode(this.funcDecl.block).compile(),
      funcType: new Wasm.FuncType({
        params,
        results,
      }),
      locals,
    });
  }
}

class LetStatementCompiler extends ASTCompiler<AST.LetStatement> {
  compile(): IR.Instruction[] {
    if (!this.root.location) {
      throw new Error(
        `LetStatementCompiler: Can't compile let statement ${this.root.symbol} without a data location`
      );
    }
    return [
      ...ASTCompiler.forNode(this.root.expr).compile(),
      new IR.LocalSet(this.root.location.offset),
    ];
  }
}

class IfStatementCompiler extends ASTCompiler<AST.IfStatement> {
  compile(): IR.Instruction[] {
    return [
      ...ASTCompiler.forNode(this.root.condExpr).compile(),
      new Wasm.IfBlock({
        then: ASTCompiler.forNode(this.root.thenBlock).compile(),
        else: ASTCompiler.forNode(this.root.elseBlock).compile(),
      }),
    ];
  }
}

class WhileStatementCompiler extends ASTCompiler<AST.WhileStatement> {
  compile() {
    return [
      ...compile(this.root.condExpr),
      new Wasm.IfBlock({
        then: [
          new Wasm.LoopBlock({
            instr: [
              ...compile(this.root.thenBlock),
              ...compile(this.root.condExpr),
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
        `SymbolRefCompiler: Can't compile reference to unlocated symbol ${this.root.name}`
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
  } else if (leftType === Intrinsics.Bool && rightType === Intrinsics.Bool) {
  } else {
    throw new Error("pushNumberOps: don't know how to cast to number");
  }
  return targetType.toValueType();
}

function pushNumberOps(left: AST.ASTNode, right: AST.ASTNode) {
  let targetType = matchTypes(left, right);
  return [
    ...ASTCompiler.forNode(left).compile(),
    ...convert(left, targetType),
    ...ASTCompiler.forNode(right).compile(),
    ...convert(right, targetType),
  ];
}

const OpCompilers: Record<
  AST.BinaryOp,
  (left: AST.ASTNode, right: AST.ASTNode) => IR.Instruction[]
> = {
  [AST.BinaryOp.ADD]: (left: AST.ASTNode, right: AST.ASTNode) => [
    ...pushNumberOps(left, right),
    new IR.Add(matchTypes(left, right)),
  ],
  [AST.BinaryOp.SUB]: (left: AST.ASTNode, right: AST.ASTNode) => [
    ...pushNumberOps(left, right),
    new IR.Sub(matchTypes(left, right)),
  ],
  [AST.BinaryOp.MUL]: (left: AST.ASTNode, right: AST.ASTNode) => [
    ...pushNumberOps(left, right),
    new IR.Mul(matchTypes(left, right)),
  ],
  [AST.BinaryOp.DIV]: (left: AST.ASTNode, right: AST.ASTNode) => [
    ...pushNumberOps(left, right),
    new IR.Div(matchTypes(left, right)),
  ],
  [AST.BinaryOp.EQUAL_TO]: (left: AST.ASTNode, right: AST.ASTNode) => [
    ...pushNumberOps(left, right),
    new IR.Equal(matchTypes(left, right)),
  ],
  [AST.BinaryOp.NOT_EQUAL_TO]: (left: AST.ASTNode, right: AST.ASTNode) => [
    ...pushNumberOps(left, right),
    new IR.NotEqual(matchTypes(left, right)),
  ],
  [AST.BinaryOp.LESS_THAN]: (left: AST.ASTNode, right: AST.ASTNode) => [
    ...pushNumberOps(left, right),
    new IR.LessThan(matchTypes(left, right)),
  ],
  [AST.BinaryOp.GREATER_THAN]: (left: AST.ASTNode, right: AST.ASTNode) => [
    ...pushNumberOps(left, right),
    new IR.GreaterThan(matchTypes(left, right)),
  ],
  [AST.BinaryOp.LOGICAL_AND]: (left: AST.ASTNode, right: AST.ASTNode) => [
    ...ASTCompiler.forNode(left).compile(),
    ...ASTCompiler.forNode(right).compile(),
    new IR.And(Intrinsics.Bool.toValueType()),
  ],
  [AST.BinaryOp.LOGICAL_OR]: (left: AST.ASTNode, right: AST.ASTNode) => [
    ...ASTCompiler.forNode(left).compile(),
    ...ASTCompiler.forNode(right).compile(),
    new IR.Or(Intrinsics.Bool.toValueType()),
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
            ...ASTCompiler.forNode(right).compile(),
            new IR.LocalTee(location.offset),
          ];
        case 'globals':
          return [
            ...compile(right),
            new IR.GlobalSet(location.offset),
            new IR.GlobalGet(location.offset),
          ];
        default:
          throw new Error(
            `ASSIGN: don't know how to compile assignment to symbol located in ${location.area}`
          );
      }
    } else {
      throw new Error(
        `Can't assign to something that is not a resolved symbol`
      );
    }
  },
  [AST.BinaryOp.ARRAY_INDEX]: (
    refExpr: AST.ASTNode,
    indexExpr: AST.ASTNode
  ) => {
    const valueType = refExpr.resolveType().toValueType();
    return [
      ...ASTCompiler.forNode(refExpr).compile(),
      ...ASTCompiler.forNode(indexExpr).compile(),
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
      return [
        ...ASTCompiler.forNode(right).compile(),
        new IR.Call(location.offset),
      ];
    } else {
      throw new Error(
        `ExpressionCompiler: Can't call unresolved symbol ${left}`
      );
    }
  },
};

class ExpressionCompiler extends ASTCompiler<AST.Expression> {
  compile(): IR.Instruction[] {
    return OpCompilers[this.root.op](this.root.left, this.root.right);
  }
}

class ExprStatementCompiler extends ASTCompiler<AST.ExprStatement> {
  compile() {
    if (this.root.expr.resolveType() === Intrinsics.Void) {
      return compile(this.root.expr);
    }
    return [...compile(this.root.expr), new IR.Drop()];
  }
}

class ArgListCompiler extends ASTCompiler<AST.ArgList> {
  compile() {
    return this.root.children
      .map((child) => ASTCompiler.forNode(child).compile())
      .flat();
  }
}

class NumberLiteralCompiler extends ASTCompiler<AST.NumberLiteral> {
  compile(): IR.Instruction[] {
    const valueType = this.root.resolveType().toValueType();
    return [new IR.PushConst(valueType, this.root.value)];
  }
}

class BooleanLiteralCompiler extends ASTCompiler<AST.BooleanLiteral> {
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
        ...ASTCompiler.forNode(child).compile(),
        // store value
        new IR.MemoryStore(arrayType.elementType.toValueType(), i * 4, 4),
      ]),
    ].flat();
    instr.push(baseAddressInstr);
    return instr;
  }
}
