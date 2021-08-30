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
    } else if (node instanceof AST.BooleanLiteral) {
      return new BooleanLiteralCompiler(node);
    } else if (node instanceof AST.ArrayLiteral) {
      return new ArrayLiteralCompiler(node);
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

type LogicalOp = AST.BinaryOp.LOGICAL_AND | AST.BinaryOp.LOGICAL_OR;
function isLogicalOp(op: AST.BinaryOp): op is LogicalOp {
  return [AST.BinaryOp.LOGICAL_AND, AST.BinaryOp.LOGICAL_OR].includes(op);
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

  private getLogicalOpInstruction() {
    const {
      BinaryOp: { LOGICAL_AND, LOGICAL_OR },
    } = AST;
    if (!isLogicalOp(this.root.op)) {
      throw new Error('panic in the disco');
    }
    switch (this.root.op) {
      case LOGICAL_AND:
        return new IR.And(this.root.resolveType().toValueType());
      case LOGICAL_OR:
        return new IR.Or(this.root.resolveType().toValueType());
    }
  }

  private compileArrayIndex(refExpr: AST.ASTNode, indexExpr: AST.ASTNode) {
    const valueType = this.root.resolveType().toValueType();
    return [
      ...ASTCompiler.forNode(refExpr).compile(),
      ...ASTCompiler.forNode(indexExpr).compile(),
      new IR.Add(valueType),
      new IR.PushConst(valueType, 4),
      new IR.Mul(valueType),
      new IR.MemoryLoad(refExpr.resolveType().toValueType(), 0),
    ];
  }

  private compileAssignment(
    left: AST.ASTNode,
    right: AST.ASTNode
  ): IR.Instruction[] {
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
    if (isLogicalOp(this.root.op)) {
      return [
        ...ASTCompiler.forNode(this.root.left).compile(),
        ...this.convert(this.root.left),
        ...ASTCompiler.forNode(this.root.right).compile(),
        this.getLogicalOpInstruction(),
      ];
    }
    if (this.root.op === AST.BinaryOp.ARRAY_INDEX) {
      return this.compileArrayIndex(this.root.left, this.root.right);
    }
    if (this.root.op === AST.BinaryOp.ASSIGN) {
      return this.compileAssignment(this.root.left, this.root.right);
    }
    throw new Error(
      `ExpressionCompiler: Not sure how to compile operator ${this.root.op} yet...`
    );
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
