import { iter, Iter } from '../utils/iter';
import { OrderedMap } from '../utils/data-structures/OrderedMap';
import {
  ArrayType,
  BaseType,
  FuncType,
  Intrinsics,
  PointerType,
  UnionType,
} from './snax-types';

export interface ASTNode {
  children: ASTNode[];
  toString(): string;
  depthFirstIter(): Iter<BaseNode>;
  preorderIter(): Iter<BaseNode>;
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

  preorderIter(): Iter<BaseNode> {
    return iter([this as BaseNode]).chain(
      ...this.children.map((c) => c.preorderIter())
    );
  }

  toString() {
    return this.name;
  }

  abstract get name(): string;
  abstract resolveType(): BaseType;
}
export type { BaseNode };

export class File extends BaseNode {
  name = 'File';
  symbolTable?: SymbolTable;

  constructor(fields: { funcs?: FuncDecl[]; globals?: GlobalDecl[] }) {
    super([...(fields.globals ?? []), ...(fields.funcs ?? [])]);
  }

  get globalDecls(): GlobalDecl[] {
    return this.children.filter(
      (child): child is GlobalDecl => child instanceof GlobalDecl
    );
  }

  get funcDecls(): FuncDecl[] {
    return this.children.filter(
      (child): child is FuncDecl => child instanceof FuncDecl
    );
  }

  resolveType(): BaseType {
    throw new Error('Files do not have types yet');
  }
}

export class BooleanLiteral extends BaseNode {
  name = 'BooleanLiteral';
  value: boolean;
  constructor(value: boolean) {
    super([]);
    this.value = value;
  }
  resolveType(): BaseType {
    return Intrinsics.bool;
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
  explicitType?: BaseType;
  constructor(
    value: number,
    numberType: NumberLiteralType = NumberLiteralType.Integer,
    explicitType?: string
  ) {
    super([]);
    this.value = value;
    this.numberType = numberType;
    if (explicitType) {
      this.explicitType = Intrinsics[explicitType];
    }
  }

  resolveType(): BaseType {
    if (this.explicitType) {
      return this.explicitType;
    }
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
  symbolRecord?: SymbolRecord;
  constructor(symbol: string) {
    super([]);
    this.symbol = symbol;
  }
  resolveType(): BaseType {
    if (!this.symbolRecord) {
      throw new Error("SymbolRef: Can't resolve type on an unresolved symbol");
    }
    return this.symbolRecord.declNode.resolveType();
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
      case 'i8':
        return Intrinsics.i8;
      case 'i16':
        return Intrinsics.i16;
      case 'i32':
        return Intrinsics.i32;
      case 'f32':
        return Intrinsics.f32;
      case 'unknown':
        return Intrinsics.unknown;
    }
    throw new Error(`TypeRef: Can't resolve type ${this.symbol}`);
  }
}

type TypeExpr = PointerTypeExpr | TypeRef;

export class PointerTypeExpr extends BaseNode {
  name = 'PointerTypeExpr';
  constructor(pointerToExpr: ASTNode) {
    super([pointerToExpr]);
  }
  get pointerToExpr() {
    return this.children[0];
  }
  resolveType(): BaseType {
    return new PointerType(this.pointerToExpr.resolveType());
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
    return Intrinsics.void;
  }
}

abstract class VariableDecl extends BaseNode {
  readonly symbol: string;
  location?: SymbolLocation;

  constructor(symbol: string, typeExpr: TypeExpr | null, expr: ASTNode) {
    if (!typeExpr) {
      typeExpr = new TypeRef('unknown');
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
}

export class GlobalDecl extends VariableDecl {
  name = 'GlobalDecl';
  resolveType() {
    let explicitType = this.typeExpr.resolveType();
    if (explicitType === Intrinsics.unknown) {
      return this.expr.resolveType();
    }
    return explicitType;
  }
}

export class LetStatement extends VariableDecl {
  name = 'LetStatement';
  resolveType() {
    let explicitType = this.typeExpr.resolveType();
    if (explicitType === Intrinsics.unknown) {
      return this.expr.resolveType();
    }
    return explicitType;
  }
}

export class IfStatement extends BaseNode {
  name = 'IfStatement';
  constructor(condExpr: ASTNode, thenBlock: Block, elseBlock?: Block) {
    super([condExpr, thenBlock, elseBlock ?? new Block([])]);
  }
  get condExpr() {
    return this.children[0];
  }
  get thenBlock() {
    return this.children[1] as Block;
  }
  get elseBlock() {
    return this.children[2] as Block;
  }
  resolveType() {
    const thenType = this.thenBlock.resolveType();
    const elseType = this.elseBlock.resolveType();
    if (thenType === elseType) {
      return thenType;
    }
    return new UnionType([thenType, elseType]);
  }
}

export class WhileStatement extends BaseNode {
  name = 'WhileStatement';
  constructor(condExpr: ASTNode, thenBlock: Block) {
    super([condExpr, thenBlock]);
  }
  get condExpr() {
    return this.children[0];
  }
  get thenBlock() {
    return this.children[1] as Block;
  }
  resolveType() {
    return Intrinsics.void;
  }
}

type SymbolLocation = {
  area: 'funcs' | 'locals' | 'globals';
  offset: number;
};

type SymbolRecord = {
  location?: SymbolLocation;
  valueType?: BaseType;
  declNode: ASTNode;
};

export class SymbolTable {
  private table: OrderedMap<string, SymbolRecord> = new OrderedMap();
  private parent: SymbolTable | null;

  constructor(parent: SymbolTable | null = null) {
    this.parent = parent;
  }

  get(symbol: string): SymbolRecord | undefined {
    return this.table.get(symbol) ?? this.parent?.get(symbol);
  }

  has(symbol: string): boolean {
    return this.table.has(symbol);
  }

  records() {
    return this.table.values();
  }

  declare(symbol: string, declNode: ASTNode) {
    this.table.set(symbol, { declNode });
  }
}

export class Block extends BaseNode {
  name = 'Block';
  get statements() {
    return this.children;
  }

  resolveType() {
    return Intrinsics.void;
  }

  symbolTable?: SymbolTable;
}

export enum BinaryOp {
  MUL = '*',
  DIV = '/',
  ADD = '+',
  SUB = '-',

  LESS_THAN = '<',
  GREATER_THAN = '>',
  EQUAL_TO = '==',
  NOT_EQUAL_TO = '!=',

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
  let { i32, f32, bool: Bool } = Intrinsics;
  const error = new Error(
    `TypeError: Can't perform ${leftType} ${op} ${rightType}`
  );
  switch (op) {
    case BinaryOp.ARRAY_INDEX:
      if (leftType instanceof ArrayType) {
        return leftType.elementType;
      } else if (leftType instanceof PointerType) {
        return leftType.toType;
      }
      throw error;
    // case BinaryOp.ADD:
    //   return Operators.Add.resolveGenerics([leftType, rightType]).returnType;
    default:
      if (leftType === rightType) {
        return leftType;
      }
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

export enum UnaryOp {
  DEREF = '@',
}
export class UnaryExpr extends BaseNode {
  name = 'UnaryExpr';
  op: UnaryOp;
  constructor(op: UnaryOp, expr: ASTNode) {
    super([expr]);
    this.op = op;
  }
  get expr() {
    return this.children[0];
  }
  resolveType() {
    switch (this.op) {
      case UnaryOp.DEREF:
        const exprType = this.expr.resolveType();
        if (exprType instanceof PointerType) {
          return exprType.toType;
        }
        throw new Error(
          `DEREF: Don't know the type when dereferencing a ${exprType.name}`
        );
    }
  }
}

export class ArrayLiteral extends BaseNode {
  name = 'Array';
  constructor(elements: ASTNode[]) {
    super(elements);
  }

  resolveType(): ArrayType {
    let type = Intrinsics.void;
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

  symbolTable?: SymbolTable;
  locals: SymbolRecord[] = [];

  constructor(
    symbol: string,
    fields?: {
      parameters?: ParameterList;
      body?: Block;
    }
  ) {
    super([
      fields?.parameters ?? new ParameterList([]),
      fields?.body ?? new Block([]),
    ]);
    this.symbol = symbol;
  }
  get parameters() {
    return (this.children[0] as ParameterList).parameters;
  }
  get block() {
    return this.children[1] as Block;
  }
  resolveType(): FuncType {
    let returnType: BaseType | null = null;
    for (const node of this.block.depthFirstIter()) {
      if (node instanceof ReturnStatement) {
        let alternativeReturnType = node.resolveType();
        if (returnType === null) {
          returnType = alternativeReturnType;
        } else if (alternativeReturnType !== returnType) {
          throw new Error(
            `FuncDecl: can't resolve type for function ${this.symbol}: return statements have varying types`
          );
        }
      }
    }
    return new FuncType(
      this.parameters.map((p) => p.resolveType()),
      returnType ?? Intrinsics.void
    );
  }
}

export class Parameter extends BaseNode {
  name = 'Parameter';
  symbol: string;
  location?: SymbolLocation;

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
    return this.expr?.resolveType() || Intrinsics.void;
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
