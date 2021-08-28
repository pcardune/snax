import { HasStackIR, Instruction, PushConst } from './stack-ir';
import * as StackIR from './stack-ir';
import { iter, Iter } from '../utils/iter';
import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { BaseType, Intrinsics } from './snax-types';

export interface ASTNode {
  children: ASTNode[];
  toString(): string;
  depthFirstIter(): Iter<BaseNode>;
  resolveType(): BaseType;
}

abstract class BaseNode implements ASTNode {
  children: ASTNode[];
  constructor(children: ASTNode[]) {
    this.children = children;
  }

  depthFirstIter(): Iter<BaseNode> {
    return iter([] as BaseNode[]).chain(
      ...this.children.map((c) => c.depthFirstIter()),
      iter([this as BaseNode])
    );
  }

  toString() {
    return this.name;
  }
  abstract get name(): string;
  abstract resolveType(): BaseType;
}
export type { BaseNode };

export class BooleanLiteral extends BaseNode {
  name = 'BooleanLiteral';
  value: boolean;
  constructor(value: boolean) {
    super([]);
    this.value = value;
  }
  resolveType(): BaseType {
    return Intrinsics.Bool;
  }
}

export enum NumberLiteralType {
  Integer = 'int',
  Float = 'float',
}
export class NumberLiteral extends BaseNode implements HasStackIR {
  name = 'NumberLiteral';
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

  resolveType(): BaseType {
    switch (this.numberType) {
      case NumberLiteralType.Float:
        return Intrinsics.f32;
      case NumberLiteralType.Integer:
        return Intrinsics.i32;
    }
  }

  toStackIR(): Instruction[] {
    const valueType = this.resolveType().toValueType();
    return [new PushConst(valueType, this.value)];
  }
}

export class SymbolRef extends BaseNode {
  name = 'SymbolRef';
  readonly symbol: string;
  constructor(symbol: string) {
    super([]);
    this.symbol = symbol;
  }
  resolveType(): BaseType {
    throw new Error("Can't resolve type on an unresolved symbol");
  }
}

export class TypeRef extends BaseNode {
  name = 'TypeRef';
  readonly symbol: string;
  constructor(symbol: string) {
    super([]);
    this.symbol = symbol;
  }
  resolveType(): BaseType {
    switch (this.symbol) {
      case 'i32':
        return Intrinsics.i32;
      case 'f32':
        return Intrinsics.f32;
      case 'unknown':
        return Intrinsics.Unknown;
    }
    throw new Error(`Can't resolve type ${this.symbol}`);
  }
}

export class TypeExpr extends BaseNode {
  name = 'TypeExpr';
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
  resolveType(): BaseType {
    throw new Error('Method not implemented.');
  }
  /**
   * Evaluate the type expression to make all
   * types concrete.
   */
  evaluate(): BaseType {
    return this.symbol.resolveType();
  }
}

export class ResolvedSymbolRef extends BaseNode {
  name = 'ResolvedSymbolRef';
  offset: number;
  valueType: BaseType;
  constructor(offset: number, valueType: BaseType) {
    super([]);
    this.offset = offset;
    this.valueType = valueType;
  }

  resolveType(): BaseType {
    return this.valueType;
  }
}

export class ExprStatement extends BaseNode {
  name = 'ExprStatement';
  constructor(expr: ASTNode) {
    super([expr]);
  }
  get expr() {
    return this.children[0] as ASTNode;
  }
  resolveType() {
    return this.expr.resolveType();
  }
}

export class LetStatement extends BaseNode {
  name: string;
  readonly symbol: string;
  constructor(symbol: string, typeExpr: TypeExpr | null, expr: ASTNode) {
    if (!typeExpr) {
      typeExpr = TypeExpr.placeholder;
    }
    super([typeExpr, expr]);
    this.name = 'LetStatement';
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
    if (explicitType === Intrinsics.Unknown) {
      return exprType;
    }
    if (explicitType === exprType) {
      return explicitType;
    }
    throw new Error(`type ${exprType} can't be assigned to an ${explicitType}`);
  }
}

export class ResolvedLetStatement extends BaseNode {
  name = 'ResolvedLetStatement';
  readonly offset: number;
  constructor(letStatement: LetStatement, offset: number) {
    super([letStatement.expr]);
    this.offset = offset;
  }
  get expr() {
    return this.children[0];
  }
  resolveType() {
    return Intrinsics.Void;
  }
}
type SymbolRecord = { offset: number; valueType: BaseType };
type SymbolTable = OrderedMap<string, SymbolRecord>;

function resolveSymbol(table: SymbolTable, child: SymbolRef) {
  const symbol = table.get(child.symbol);
  if (!symbol) {
    throw new Error(`Reference to undeclared symbol ${child.symbol}`);
  }
  return new ResolvedSymbolRef(symbol.offset, symbol.valueType);
}

function resolveSymbols(table: SymbolTable, node: ASTNode) {
  for (const [i, child] of node.children.entries()) {
    if (child instanceof SymbolRef) {
      node.children[i] = resolveSymbol(table, child);
    } else {
      resolveSymbols(table, child);
    }
  }
}

export class Block extends BaseNode {
  name = 'Block';
  get statements() {
    return this.children;
  }

  resolveType() {
    if (this.statements.length > 0) {
      return this.statements[this.statements.length - 1].resolveType();
    }
    return Intrinsics.Void;
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
}

export enum BinaryOp {
  MUL = '*',
  DIV = '/',
  ADD = '+',
  SUB = '-',
  ASSIGN = '=',
}

const getASTValueTypeForBinaryOp = (
  op: BinaryOp,
  leftType: BaseType,
  rightType: BaseType
): BaseType => {
  let { i32: Integer, f32: Float } = Intrinsics;
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

export class Expression extends BaseNode {
  name = 'Expression';
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

  resolveType(): BaseType {
    return getASTValueTypeForBinaryOp(
      this.op,
      this.left.resolveType(),
      this.right.resolveType()
    );
  }
}
