import { iter, Iter } from '../utils/iter';
import { OrderedMap } from '../utils/data-structures/OrderedMap';
import {
  ArrayType,
  BaseType,
  FuncType,
  Intrinsics,
  Operators,
} from './snax-types';

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
export class NumberLiteral extends BaseNode {
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
}

export class SymbolRef extends BaseNode {
  name = 'SymbolRef';
  readonly symbol: string;
  constructor(symbol: string) {
    super([]);
    this.symbol = symbol;
  }
  resolveType(): BaseType {
    throw new Error("SymbolRef: Can't resolve type on an unresolved symbol");
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
    return this.symbol.resolveType();
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
// type SymbolTable = OrderedMap<string, SymbolRecord>;

export class SymbolTable {
  private table: OrderedMap<string, SymbolRecord> = new OrderedMap();
  private parent: SymbolTable | null;
  private localValueTypes: BaseType[] = [];
  private funcTypes: FuncType[] = [];

  constructor(parent: SymbolTable | null = null) {
    this.parent = parent;
  }

  get(symbol: string): SymbolRecord | undefined {
    return this.table.get(symbol) ?? this.parent?.get(symbol);
  }

  has(symbol: string): boolean {
    return this.table.has(symbol);
  }

  values(): Iter<BaseType> {
    return iter(this.getTopParent().localValueTypes);
  }

  private getTopParent() {
    let table: SymbolTable = this;
    while (table.parent) {
      table = table.parent;
    }
    return table;
  }

  reserve(symbol: string, valueType: BaseType) {
    if (valueType instanceof FuncType) {
      let offset = this.funcTypes.length;
      this.funcTypes.push(valueType);
      this.table.set(symbol, { offset, valueType });
      return offset;
    } else {
      let top = this.getTopParent();
      let offset = top.localValueTypes.length;
      top.localValueTypes.push(valueType);
      this.table.set(symbol, { offset, valueType });
      return offset;
    }
  }
}

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
      for (let i = this.statements.length - 1; i >= 0; i--) {
        let sType = this.statements[i].resolveType();
        if (!(sType instanceof FuncType)) {
          return sType;
        }
      }
    }
    return Intrinsics.Void;
  }

  private symbolTable: SymbolTable | null = null;

  resolveSymbols(parentSymbolTable: SymbolTable | null): SymbolTable {
    if (this.symbolTable) {
      return this.symbolTable;
    }
    this.symbolTable = new SymbolTable(parentSymbolTable);
    for (let [i, astNode] of this.statements.entries()) {
      if (astNode instanceof Block) {
        astNode.resolveSymbols(this.symbolTable);
      }
      if (!(astNode instanceof FuncDecl)) {
        resolveSymbols(this.symbolTable, astNode);
      }
      if (astNode instanceof LetStatement) {
        if (this.symbolTable.has(astNode.symbol)) {
          throw new Error(
            `Redeclaration of symbol ${astNode.symbol} in the same scope`
          );
        }
        const offset = this.symbolTable.reserve(
          astNode.symbol,
          astNode.expr.resolveType()
        );
        const resolved = new ResolvedLetStatement(astNode, offset);
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

  LESS_THAN = '<',
  GREATER_THAN = '>',
  EQUAL_TO = '==',

  ASSIGN = '=',

  LOGICAL_AND = '&&',
  LOGICAL_OR = '||',

  ARRAY_INDEX = '[]',

  CALL = 'call',
}

const getTypeForBinaryOp = (
  op: BinaryOp,
  leftType: BaseType,
  rightType: BaseType
): BaseType => {
  let { i32, f32, Bool } = Intrinsics;
  const error = new Error(
    `TypeError: Can't perform ${leftType} ${op} ${rightType}`
  );
  switch (op) {
    case BinaryOp.ARRAY_INDEX:
      if (leftType instanceof ArrayType) {
        return leftType.elementType;
      }
      throw error;
    // case BinaryOp.ADD:
    //   return Operators.Add.resolveGenerics([leftType, rightType]).returnType;
    default:
      switch (leftType) {
        case Bool:
          switch (rightType) {
            case Bool:
              return Bool;
            default:
              throw error;
          }
        case i32:
          switch (rightType) {
            case i32:
              return i32;
            case f32:
              return f32;
            default:
              throw error;
          }
        case f32:
          switch (rightType) {
            case i32:
            case f32:
              return f32;
            default:
              throw error;
          }
        default:
          throw error;
      }
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
    if (this.op === BinaryOp.CALL) {
      const leftType = this.left.resolveType();
      if (leftType instanceof FuncType) {
        return leftType.returnType;
      } else {
        throw new Error("Can't call something that is not a function");
      }
    }
    return getTypeForBinaryOp(
      this.op,
      this.left.resolveType(),
      this.right.resolveType()
    );
  }
}

export class ArrayLiteral extends BaseNode {
  name = 'Array';
  constructor(elements: ASTNode[]) {
    super(elements);
  }

  resolveType(): ArrayType {
    let type = Intrinsics.Void;
    for (const [i, element] of this.children.entries()) {
      if (i == 0) {
        type = element.resolveType();
      } else if (element.resolveType() !== type) {
        throw new Error("Can't have an array with mixed types.");
      }
    }
    return new ArrayType(type, this.children.length);
  }
}

export class ParameterList extends BaseNode {
  name = 'ParameterList';
  constructor(parameters: Parameter[]) {
    super(parameters);
  }
  get parameters() {
    return this.children as Parameter[];
  }
  resolveType(): BaseType {
    throw new Error("ParameterList nodes don't have a type");
  }
}

export class FuncDecl extends BaseNode {
  name = 'FuncDecl';
  symbol: string;
  constructor(symbol: string, parameters: ParameterList, body: Block) {
    super([parameters, body]);
    this.symbol = symbol;
  }
  get parameters() {
    return (this.children[0] as ParameterList).parameters;
  }
  get block() {
    return this.children[1] as Block;
  }
  resolveType(): FuncType {
    return new FuncType(
      this.parameters.map((p) => p.resolveType()),
      this.block.resolveType()
    );
  }
}

export class Parameter extends BaseNode {
  name = 'Parameter';
  symbol: string;
  constructor(symbol: string, typeExpr: TypeExpr) {
    super([typeExpr]);
    this.symbol = symbol;
  }
  get typeExpr() {
    return this.children[0] as TypeExpr;
  }
  resolveType(): BaseType {
    return this.typeExpr.resolveType();
  }
}

export class ReturnStatement extends BaseNode {
  name = 'Return';
  constructor(expr?: ASTNode) {
    super(expr ? [expr] : []);
  }
  get expr(): ASTNode | null {
    return this.children[0] || null;
  }
  resolveType(): BaseType {
    return this.expr?.resolveType() || Intrinsics.Void;
  }
}

export class ArgList extends BaseNode {
  name = 'ArgList';
  constructor(args: ASTNode[]) {
    super(args);
  }
  resolveType(): BaseType {
    throw new Error('ArgLists do not have a type');
  }
}
