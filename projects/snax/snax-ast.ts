import { Add, HasStackIR, Instruction, PushConst, ValueType } from './stack-ir';
import * as StackIR from './stack-ir';
import { iter, Iter } from '../utils/iter';
import { OrderedMap } from '../utils/data-structures/OrderedMap';

export enum ASTValueType {
  Integer = 'int',
  Float = 'float',
  Void = 'void',
}

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

  abstract resolveType(): ASTValueType;
}

export class NumberLiteral extends BaseNode implements HasStackIR {
  readonly value: number;
  readonly numberType: ASTValueType;
  constructor(value: number, numberType: ASTValueType = ASTValueType.Integer) {
    super([]);
    this.value = value;
    this.numberType = numberType;
  }

  resolveType(): ASTValueType {
    return this.numberType;
  }

  toStackIR(): Instruction[] {
    switch (this.numberType) {
      case ASTValueType.Integer:
        return [new PushConst(ValueType.i32, this.value)];
      case ASTValueType.Float:
        return [new PushConst(ValueType.f32, this.value)];
      case ASTValueType.Void:
        throw new Error(
          `Unrecognized value type ${this.numberType} for NumberLiteral`
        );
    }
  }
}

export class SymbolRef extends BaseNode {
  readonly symbol: string;
  constructor(symbol: string) {
    super([]);
    this.symbol = symbol;
  }
  resolveType(): ASTValueType {
    throw new Error("Can't resolve type on an unresolved symbol");
  }
}

export class ResolvedSymbolRef extends BaseNode implements HasStackIR {
  offset: number;
  valueType: ASTValueType;
  constructor(offset: number, valueType: ASTValueType) {
    super([]);
    this.offset = offset;
    this.valueType = valueType;
  }

  toStackIR(): Instruction[] {
    return [new StackIR.LocalGet(this.offset)];
  }
  resolveType(): ASTValueType {
    return this.valueType;
  }
}

export class ExprStatement extends BaseNode {
  constructor(expr: ASTNode) {
    super([expr]);
  }
  get expr() {
    return this.children[0];
  }
  resolveType() {
    return this.expr.resolveType();
  }

  toStackIR(): Instruction[] {
    if (this.expr.hasStackIR()) {
      return this.expr.toStackIR();
    }
    throw new Error("Can't generate stack IR for this yet...");
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
  resolveType() {
    return this.expr.resolveType();
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
  resolveType() {
    return ASTValueType.Void;
  }
  toStackIR(): Instruction[] {
    if (this.expr.hasStackIR()) {
      return [...this.expr.toStackIR(), new StackIR.LocalSet(this.offset)];
    }
    throw new Error("Can't generate stack IR for this yet...");
  }
}
type SymbolRecord = { offset: number; valueType: ASTValueType };
type SymbolTable = OrderedMap<string, SymbolRecord>;

function resolveSymbol(table: SymbolTable, child: SymbolRef) {
  const symbol = table.get(child.symbol);
  if (!symbol) {
    throw new Error(`Reference to undeclared symbol ${child.symbol}`);
  }
  return new ResolvedSymbolRef(symbol.offset, symbol.valueType);
}

function resolveSymbols(table: SymbolTable, node: BaseNode) {
  for (const [i, child] of node.children.entries()) {
    if (child instanceof SymbolRef) {
      node.children[i] = resolveSymbol(table, child);
    } else {
      resolveSymbols(table, child);
    }
  }
}

export class Block extends BaseNode implements HasStackIR {
  constructor(children: BaseNode[]) {
    super(children);
  }
  get statements() {
    return this.children;
  }

  resolveType() {
    if (this.statements.length > 0) {
      return this.statements[this.statements.length - 1].resolveType();
    }
    return ASTValueType.Void;
  }

  private table: SymbolTable | null = null;

  resolveSymbols(): SymbolTable {
    if (this.table) {
      return this.table;
    }
    this.table = new OrderedMap();
    let offset = 0;
    for (let [i, astNode] of this.statements.entries()) {
      resolveSymbols(this.table, astNode);
      if (astNode instanceof LetStatement) {
        if (this.table.has(astNode.symbol)) {
          throw new Error(
            `Redeclaration of symbol ${astNode.symbol} in the same scope`
          );
        }

        const resolved = new ResolvedLetStatement(astNode, offset);
        this.table.set(astNode.symbol, {
          offset: offset++,
          valueType: resolved.expr.resolveType(),
        });
        this.statements[i] = resolved;
      }
    }
    return this.table;
  }

  toStackIR(): Instruction[] {
    this.resolveSymbols();
    let stackIR: Instruction[] = [];
    for (const astNode of this.statements) {
      if (astNode.hasStackIR()) {
        stackIR.push(...astNode.toStackIR());
      } else {
        throw new Error(
          `Can't create stack ir for block: ${astNode} doesn't have stack ir`
        );
      }
    }
    return stackIR;
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
  valueType: StackIR.ValueType
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

const getASTValueTypeForBinaryOp = (
  op: BinaryOp,
  leftType: ASTValueType,
  rightType: ASTValueType
): ASTValueType => {
  let { Integer, Float } = ASTValueType;
  switch (leftType) {
    case Integer:
      switch (rightType) {
        case Integer:
          return Integer;
        case Float:
          return Float;
        default:
          throw new Error(`Can't perform ${leftType}${op}${rightType}`);
      }
    case Float:
      switch (rightType) {
        case Integer:
        case Float:
          return Float;
        default:
          throw new Error(`Can't perform ${leftType}${op}${rightType}`);
      }
    default:
      throw new Error(`Can't perform ${leftType}${op}${rightType}`);
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

  resolveType(): ASTValueType {
    return getASTValueTypeForBinaryOp(
      this.op,
      this.left.resolveType(),
      this.right.resolveType()
    );
  }

  toStackIR(): Instruction[] {
    if (this.left.hasStackIR() && this.right.hasStackIR()) {
      const instructions = [
        ...this.left.toStackIR(),
        ...this.right.toStackIR(),
      ];
      let typeMapping = {
        [ASTValueType.Float]: ValueType.f32,
        [ASTValueType.Integer]: ValueType.i32,
        [ASTValueType.Void]: null,
      };

      instructions.push(
        stackInstructionForBinaryOp(
          this.op,
          typeMapping[this.resolveType()] as ValueType
        )
      );
      return instructions;
    }
    throw new Error("can't generate stack IR for this j0nx");
  }
}

export type ASTNode =
  | NumberLiteral
  | SymbolRef
  | Expression
  | LetStatement
  | ExprStatement
  | Block
  | ResolvedSymbolRef
  | ResolvedLetStatement;
