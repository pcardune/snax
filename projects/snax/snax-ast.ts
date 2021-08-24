import { Add, HasStackIR, Instruction, PushConst, Type } from './stack-ir';
import * as StackIR from './stack-ir';
import { iter, Iter } from '../utils/iter';
import { OrderedMap } from '../utils/data-structures/OrderedMap';

abstract class BaseNode {
  children: BaseNode[];
  constructor(children: BaseNode[]) {
    this.children = children;
  }

  hasStackIR(): this is HasStackIR {
    return !!(this as any).toStackIR;
  }

  depthFirstIter(): Iter<BaseNode> {
    return iter([] as BaseNode[]).chain(
      ...this.children.map((c) => c.depthFirstIter()),
      iter([this as BaseNode])
    );
  }
}

export class NumberLiteral extends BaseNode implements HasStackIR {
  readonly value: number;
  constructor(value: number) {
    super([]);
    this.value = value;
  }

  toStackIR(): Instruction[] {
    return [new PushConst(Type.i32, this.value)];
  }
}

export class SymbolRef extends BaseNode {
  readonly symbol: string;
  constructor(symbol: string) {
    super([]);
    this.symbol = symbol;
  }
}

export class ResolvedSymbolRef extends BaseNode implements HasStackIR {
  offset: number;
  constructor(offset: number) {
    super([]);
    this.offset = offset;
  }
  toStackIR(): Instruction[] {
    return [new StackIR.LocalGet(this.offset)];
  }
}

export class LetStatement extends BaseNode {
  readonly symbol: string;
  constructor(symbol: string, expr: ASTNode) {
    super([expr]);
    this.symbol = symbol;
  }
  get expr() {
    return this.children[0];
  }
}

export class ResolvedLetStatement extends BaseNode implements HasStackIR {
  readonly offset: number;
  constructor(letStatement: LetStatement, offset: number) {
    super([letStatement.expr]);
    this.offset = offset;
  }
  get expr() {
    return this.children[0];
  }
  toStackIR(): Instruction[] {
    if (this.expr.hasStackIR()) {
      return [...this.expr.toStackIR(), new StackIR.LocalSet(this.offset)];
    }
    throw new Error("Can't generate stack IR for this yet...");
  }
}

type SymbolTable = OrderedMap<string, number>;

function resolveSymbols(table: SymbolTable, node: BaseNode) {
  for (const [i, child] of node.children.entries()) {
    if (child instanceof SymbolRef) {
      if (!table.has(child.symbol)) {
        throw new Error(`Reference to undeclared symbol ${child.symbol}`);
      }
      const offset = table.get(child.symbol) as number;
      node.children[i] = new ResolvedSymbolRef(offset);
    } else {
      resolveSymbols(table, child);
    }
  }
}

export class Block extends BaseNode implements HasStackIR {
  get statements() {
    return this.children;
  }

  toStackIR(): Instruction[] {
    const table: SymbolTable = new OrderedMap();
    let offset = 0;
    let stackIR: Instruction[] = [];
    for (const [i, letStatement] of this.statements.entries()) {
      if (letStatement instanceof LetStatement) {
        if (table.has(letStatement.symbol)) {
          throw new Error(
            `Redeclaration of symbol ${letStatement.symbol} in the same scope`
          );
        }

        resolveSymbols(table, letStatement);
        const resolved = new ResolvedLetStatement(letStatement, offset);
        table.set(letStatement.symbol, offset++);
        this.statements[i] = resolved;
        stackIR.push(...resolved.toStackIR());
      }
    }
    if (table.length > 0) {
      stackIR.push(new StackIR.LocalGet(table.length - 1));
    }
    return stackIR;
  }

  getSymbolTable() {
    const table: Map<string, LetStatement> = new Map();
    for (const letStatement of this.statements) {
      if (letStatement instanceof LetStatement) {
        table.set(letStatement.symbol, letStatement);
      }
    }
    return table;
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
  readonly op: BinaryOp;
  constructor(op: BinaryOp, left: ASTNode, right: ASTNode) {
    super([left, right]);
    this.op = op;
  }
  get left() {
    return this.children[0];
  }
  get right() {
    return this.children[1];
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

export type ASTNode =
  | NumberLiteral
  | SymbolRef
  | Expression
  | LetStatement
  | Block
  | ResolvedSymbolRef
  | ResolvedLetStatement;
