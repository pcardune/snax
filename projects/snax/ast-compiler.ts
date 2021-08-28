import * as AST from './snax-ast';
import * as IR from './stack-ir';

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
    } else {
      throw new Error(`No compiler available for node ${node.toString()}`);
    }
  }
}

export class BlockCompiler extends ASTCompiler<AST.Block> {
  compile(): IR.Instruction[] {
    this.root.resolveSymbols();
    return this.root.statements
      .map((astNode) => ASTCompiler.forNode(astNode).compile())
      .flat();
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

type NumericOp =
  | AST.BinaryOp.MUL
  | AST.BinaryOp.DIV
  | AST.BinaryOp.ADD
  | AST.BinaryOp.SUB;

function isNumericOp(op: AST.BinaryOp): op is NumericOp {
  return [
    AST.BinaryOp.MUL,
    AST.BinaryOp.DIV,
    AST.BinaryOp.ADD,
    AST.BinaryOp.SUB,
  ].includes(op);
}

class ExpressionCompiler extends ASTCompiler<AST.Expression> {
  private getNumericalOpInstruction() {
    const { BinaryOp } = AST;
    const valueType = this.root.resolveType().toValueType();
    if (!isNumericOp(this.root.op)) {
      throw new Error('panic in the disco');
    }
    switch (this.root.op) {
      case BinaryOp.ADD:
        return new IR.Add(valueType);
      case BinaryOp.SUB:
        return new IR.Sub(valueType);
      case BinaryOp.MUL:
        return new IR.Mul(valueType);
      case BinaryOp.DIV:
        return new IR.Div(valueType);
    }
  }

  private convert(child: AST.ASTNode) {
    const targetType = this.root.resolveType().toValueType();
    const childType = child.resolveType().toValueType();
    if (childType === targetType) {
      return [];
    }
    if (IR.isIntType(childType) && IR.isFloatType(targetType)) {
      return [new IR.Convert(childType, targetType)];
    }
    throw new Error(`Can't convert from a ${childType} to a ${targetType}`);
  }

  compile(): IR.Instruction[] {
    if (isNumericOp(this.root.op)) {
      return [
        ...ASTCompiler.forNode(this.root.left).compile(),
        ...this.convert(this.root.left),
        ...ASTCompiler.forNode(this.root.right).compile(),
        this.getNumericalOpInstruction(),
      ];
    }
    throw new Error(`Not sure how to compile operator ${this.root.op} yet...`);
  }
}

class NumberLiteralCompiler extends ASTCompiler<AST.NumberLiteral> {
  compile(): IR.Instruction[] {
    const valueType = this.root.resolveType().toValueType();
    return [new IR.PushConst(valueType, this.root.value)];
  }
}
