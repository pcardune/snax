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
    } else if (node instanceof AST.ResolvedLetStatement) {
      return new ResolvedLetStatementCompiler(node);
    } else if (node instanceof AST.ResolvedSymbolRef) {
      return new ResolvedSymbolRefCompiler(node);
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
    this.root.resolveSymbols(null);
    return this.root.statements
      .filter((astNode) => !(astNode instanceof AST.FuncDecl))
      .map((astNode) => ASTCompiler.forNode(astNode).compile())
      .flat();
  }
}

export class ModuleCompiler {
  block: AST.Block;
  constructor(block: AST.Block) {
    this.block = block;
  }
  compile(): Wasm.Module {
    const symbolTable = new AST.SymbolTable();

    const funcNodes = this.block.statements.filter(
      (statement): statement is AST.FuncDecl =>
        statement instanceof AST.FuncDecl
    );
    let funcs: Wasm.Func[] = [];
    for (const func of funcNodes) {
      funcs.push(new FuncDeclCompiler(func).compile());
      symbolTable.reserve(func.symbol, func.resolveType());
    }

    this.block.resolveSymbols(symbolTable);

    const body = ASTCompiler.forNode(this.block).compile();
    const blockType = this.block.resolveType();
    const results =
      blockType === Intrinsics.Void ? [] : [blockType.toValueType()];
    const locals = [
      ...symbolTable.values().map((t) => new Wasm.Local(t.toValueType())),
    ];
    return new Wasm.Module({
      funcs: [
        ...funcs,
        new Wasm.Func({
          funcType: new Wasm.FuncType({
            results,
            params: [],
          }),
          locals,
          exportName: 'main',
          body,
        }),
      ],
    });
  }
}

export class FuncDeclCompiler {
  funcDecl: AST.FuncDecl;
  constructor(funcDecl: AST.FuncDecl) {
    this.funcDecl = funcDecl;
  }
  compile(): Wasm.Func {
    const symbolTable = new AST.SymbolTable();
    for (const param of this.funcDecl.parameters) {
      symbolTable.reserve(param.symbol, param.resolveType());
    }
    this.funcDecl.block.resolveSymbols(symbolTable);

    const funcType = this.funcDecl.resolveType();
    const params = funcType.argTypes.map((t) => t.toValueType());
    const results =
      funcType.returnType === Intrinsics.Void
        ? []
        : [funcType.returnType.toValueType()];
    return new Wasm.Func({
      id: this.funcDecl.symbol,
      body: ASTCompiler.forNode(this.funcDecl.block).compile(),
      funcType: new Wasm.FuncType({
        params,
        results,
      }),
    });
  }
}

class ResolvedLetStatementCompiler extends ASTCompiler<AST.ResolvedLetStatement> {
  compile(): IR.Instruction[] {
    return [
      ...ASTCompiler.forNode(this.root.expr).compile(),
      new IR.LocalSet(this.root.offset),
    ];
  }
}

class ResolvedSymbolRefCompiler extends ASTCompiler<AST.ResolvedSymbolRef> {
  compile(): IR.Instruction[] {
    return [new IR.LocalGet(this.root.offset)];
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
    if (left instanceof AST.ResolvedSymbolRef) {
      return [
        ...ASTCompiler.forNode(right).compile(),
        new IR.LocalSet(left.offset),
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
    if (left instanceof AST.ResolvedSymbolRef) {
      return [
        ...ASTCompiler.forNode(right).compile(),
        new IR.Call(left.offset),
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
