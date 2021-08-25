import {
  Add,
  HasStackIR,
  Instruction,
  PushConst,
  NumberType,
} from './stack-ir';
import * as StackIR from './stack-ir';
import { iter, Iter } from '../utils/iter';
import { OrderedMap } from '../utils/data-structures/OrderedMap';

export abstract class ASTValueType {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  static i32: ASTValueType;
  static i64: ASTValueType;
  static f32: ASTValueType;
  static f64: ASTValueType;
  static Unknown: ASTValueType;
  static Void: ASTValueType;

  abstract toValueType(): NumberType;

  toString(): string {
    return this.name;
  }
}

class NumericalType extends ASTValueType {
  // The size in bytes
  size: number;
  interpretation: 'float' | 'int';
  constructor(name: string, interpretation: 'float' | 'int', size: number) {
    super(name);
    this.interpretation = interpretation;
    this.size = size;
  }
  toString() {
    return `${this.interpretation}${this.size * 8}`;
  }
  toValueType(): NumberType {
    const { i32, i64, f32, f64 } = NumberType;
    if (this.interpretation === 'float') {
      if (this.size <= 4) {
        return f32;
      } else if (this.size <= 8) {
        return f64;
      } else {
        throw new Error(
          "Don't know how to store numbers with more than 8 bytes yet"
        );
      }
    } else {
      if (this.size <= 4) {
        return i32;
      } else if (this.size <= 8) {
        return i64;
      } else {
        throw new Error(
          "Don't know how to store numbers with more than 8 bytes yet"
        );
      }
    }
  }
}
ASTValueType.i32 = new NumericalType('i32', 'int', 4);
ASTValueType.i64 = new NumericalType('i64', 'int', 8);
ASTValueType.f32 = new NumericalType('f32', 'float', 4);
ASTValueType.f64 = new NumericalType('f64', 'float', 8);

class VoidType extends ASTValueType {
  constructor() {
    super('void');
  }
  toValueType(): NumberType {
    throw new Error('void types do not have a corresponding value type');
  }
}
ASTValueType.Void = new VoidType();
class UnknownType extends ASTValueType {
  constructor() {
    super('unknown');
  }
  toValueType(): NumberType {
    throw new Error('unknown types do not have a corresponding value type');
  }
}
ASTValueType.Unknown = new UnknownType();

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
export enum NumberLiteralType {
  Integer = 'int',
  Float = 'float',
}
export class NumberLiteral extends BaseNode implements HasStackIR {
  readonly value: number;
  readonly numberType: NumberLiteralType;
  constructor(
    value: number,
    numberType: NumberLiteralType = NumberLiteralType.Integer
  ) {
    super([]);
    this.value = value;
    this.numberType = numberType;
  }

  resolveType(): ASTValueType {
    switch (this.numberType) {
      case NumberLiteralType.Float:
        return ASTValueType.f32;
      case NumberLiteralType.Integer:
        return ASTValueType.i32;
    }
  }

  toStackIR(): Instruction[] {
    switch (this.resolveType()) {
      case ASTValueType.i32:
        return [new PushConst(NumberType.i32, this.value)];
      case ASTValueType.f32:
        return [new PushConst(NumberType.f32, this.value)];
      default:
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

export class TypeRef extends BaseNode {
  readonly symbol: string;
  constructor(symbol: string) {
    super([]);
    this.symbol = symbol;
  }
  resolveType(): ASTValueType {
    switch (this.symbol) {
      case 'i32':
        return ASTValueType.i32;
      case 'f32':
        return ASTValueType.f32;
      case 'unknown':
        return ASTValueType.Unknown;
    }
    throw new Error(`Can't resolve type ${this.symbol}`);
  }
}

export class TypeExpr extends BaseNode {
  /**
   * The placeholder type
   */
  static placeholder = new TypeExpr(new TypeRef('unknown'));

  constructor(symbol: ASTNode) {
    super([symbol]);
  }
  get symbol() {
    return this.children[0];
  }
  resolveType(): ASTValueType {
    throw new Error('Method not implemented.');
  }
  /**
   * Evaluate the type expression to make all
   * types concrete.
   */
  evaluate(): ASTValueType {
    return this.symbol.resolveType();
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
  constructor(symbol: string, typeExpr: TypeExpr | null, expr: ASTNode) {
    if (!typeExpr) {
      typeExpr = TypeExpr.placeholder;
    }
    super([typeExpr, expr]);
    this.symbol = symbol;
  }
  get typeExpr(): TypeExpr {
    return this.children[0] as TypeExpr;
  }
  get expr() {
    return this.children[1];
  }
  resolveType() {
    let explicitType = this.typeExpr.evaluate();
    let exprType = this.expr.resolveType();
    if (explicitType === ASTValueType.Unknown) {
      return exprType;
    }
    if (explicitType === exprType) {
      return explicitType;
    }
    throw new Error(`type ${exprType} can't be assigned to an ${explicitType}`);
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

  private symbolTable: SymbolTable | null = null;

  resolveSymbols(): SymbolTable {
    if (this.symbolTable) {
      return this.symbolTable;
    }
    this.symbolTable = new OrderedMap();
    let offset = 0;
    for (let [i, astNode] of this.statements.entries()) {
      resolveSymbols(this.symbolTable, astNode);
      if (astNode instanceof LetStatement) {
        if (this.symbolTable.has(astNode.symbol)) {
          throw new Error(
            `Redeclaration of symbol ${astNode.symbol} in the same scope`
          );
        }
        const resolved = new ResolvedLetStatement(astNode, offset);
        this.symbolTable.set(astNode.symbol, {
          offset: offset++,
          valueType: resolved.expr.resolveType(),
        });
        this.statements[i] = resolved;
      }
    }
    return this.symbolTable;
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
  valueType: StackIR.NumberType
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
  let { i32: Integer, f32: Float } = ASTValueType;
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
      let valueType: NumberType;
      switch (this.resolveType()) {
        case ASTValueType.f32:
          valueType = NumberType.f32;
          break;
        case ASTValueType.i32:
          valueType = NumberType.i32;
          break;
        default:
          throw new Error(
            `No representation for type ${this.resolveType()} in stackIR`
          );
      }
      instructions.push(stackInstructionForBinaryOp(this.op, valueType));
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
