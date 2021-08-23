import {
  Add,
  hasStackIR,
  HasStackIR,
  Instruction,
  PushConst,
  Type,
} from './stack-ir';
import * as StackIR from './stack-ir';

abstract class BaseNode {
  toStackIR?(): Instruction[];
  hasStackIR(): this is HasStackIR {
    return !!this.toStackIR;
  }
}

export class NumberLiteral extends BaseNode implements HasStackIR {
  readonly value: number;
  constructor(value: number) {
    super();
    this.value = value;
  }

  toStackIR(): Instruction[] {
    return [new PushConst(Type.i32, this.value)];
  }
}

export enum BinaryOp {
  MUL = '*',
  DIV = '/',
  ADD = '+',
  SUB = '-',
}

const stackInstructionForBinaryOp = (
  op: BinaryOp,
  valueType: StackIR.Type = Type.i32
) => {
  switch (op) {
    case BinaryOp.ADD:
      return new Add(valueType);
    case BinaryOp.SUB:
      return new StackIR.Sub(valueType);
    case BinaryOp.MUL:
      return new StackIR.Mul(valueType);
    case BinaryOp.DIV:
      return new StackIR.Div(valueType);
  }
};

export class Expression extends BaseNode implements HasStackIR {
  readonly left: ASTNode;
  readonly right: ASTNode;
  readonly op: BinaryOp;
  constructor(op: BinaryOp, left: ASTNode, right: ASTNode) {
    super();
    this.op = op;
    this.left = left;
    this.right = right;
  }

  override hasStackIR(): this is HasStackIR {
    return this.left.hasStackIR() && this.right.hasStackIR();
  }

  toStackIR(): Instruction[] {
    if (this.left.hasStackIR() && this.right.hasStackIR()) {
      return [
        ...this.left.toStackIR(),
        ...this.right.toStackIR(),
        stackInstructionForBinaryOp(this.op),
      ];
    }
    throw new Error("can't generate stack IR for this j0nx");
  }
}

export type ASTNode = NumberLiteral | Expression;
