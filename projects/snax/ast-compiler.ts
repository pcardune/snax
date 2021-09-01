import * as AST from './snax-ast';
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
      return ASTCompiler.forNode(node.expr);
    } else if (node instanceof AST.NumberLiteral) {
      return new NumberLiteralCompiler(node);
    } else if (node instanceof AST.Block) {
      return new BlockCompiler(node);
    } else if (node instanceof AST.LetStatement) {
      return new LetStatementCompiler(node);
    } else if (node instanceof AST.SymbolRef) {
      return new SymbolRefCompiler(node);
    } else if (node instanceof AST.BooleanLiteral) {
      return new BooleanLiteralCompiler(node);
    } else if (node instanceof AST.ArrayLiteral) {
      return new ArrayLiteralCompiler(node);
    } else if (node instanceof AST.ArgList) {
      return new ArgListCompiler(node);
    } else if (node instanceof AST.ReturnStatement) {
      return new ReturnStatementCompiler(node);
    } else {
      throw new Error(
        `ASTCompiler: No compiler available for node ${node.toString()}`
      );
    }
  }
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
  let offset = 0;
  for (const record of file.symbolTable!.records()) {
    if (record.declNode instanceof AST.FuncDecl) {
      record.declNode.locals = [];
      record.location = { area: 'funcs', offset: offset++ };
      recurse(record.declNode, record.declNode);
    }
  }
}

export class ModuleCompiler {
  block: AST.Block;
  constructor(block: AST.Block) {
    this.block = block;
  }
  compile(): Wasm.Module {
    // step 1 is to extract functions and put everything
    // into a file.
    const funcDecls = this.block.children.filter(
      (statement): statement is AST.FuncDecl =>
        statement instanceof AST.FuncDecl
    );
    this.block.children = this.block.children.filter(
      (child) => !(child instanceof AST.FuncDecl)
    );

    const file = new AST.File([
      ...funcDecls,
      new AST.FuncDecl('main', new AST.ParameterList([]), this.block),
    ]);

    resolveSymbols(file);
    assignStorageLocations(file);

    const funcs: Wasm.Func[] = file.funcDecls.map((func) => {
      const wasmFunc = new FuncDeclCompiler(func).compile();
      if (func.symbol === 'main') {
        wasmFunc.fields.exportName = 'main';
      }
      return wasmFunc;
    });

    return new Wasm.Module({
      funcs: [...funcs],
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

class SymbolRefCompiler extends ASTCompiler<AST.SymbolRef> {
  compile(): IR.Instruction[] {
    const location = this.root.symbolRecord?.location;
    if (!location) {
      throw new Error(
        `SymbolRefCompiler: Can't compile reference to unlocated symbol ${this.root.name}`
      );
    }
    return [new IR.LocalGet(this.root.symbolRecord!.location!.offset)];
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
      return [
        ...ASTCompiler.forNode(right).compile(),
        new IR.LocalSet(location.offset),
      ];
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
  [AST.BinaryOp.EQUAL_TO]: () => {
    throw new Error('EQUAL_TO not implemented yet');
  },
  [AST.BinaryOp.LESS_THAN]: () => {
    throw new Error('LESS_THAN not implemented yet');
  },
  [AST.BinaryOp.GREATER_THAN]: () => {
    throw new Error('GREATER_THAN not implemented yet');
  },
};

class ExpressionCompiler extends ASTCompiler<AST.Expression> {
  compile(): IR.Instruction[] {
    return OpCompilers[this.root.op](this.root.left, this.root.right);
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
