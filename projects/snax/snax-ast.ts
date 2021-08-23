export class NumberLiteral {
  readonly value: number;
  constructor(value: number) {
    this.value = value;
  }
}

export enum BinaryOp {
  MUL = '*',
  DIV = '/',
  ADD = '+',
  SUB = '-',
}

export class Expression {
  readonly left: ASTNode;
  readonly right: ASTNode;
  readonly op: BinaryOp;
  constructor(op: BinaryOp, left: ASTNode, right: ASTNode) {
    this.op = op;
    this.left = left;
    this.right = right;
  }
}

export type ASTNode = NumberLiteral | Expression;
