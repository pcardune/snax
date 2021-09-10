import { ArrayType, BaseType, Intrinsics, PointerType } from './snax-types.js';

export enum NumberLiteralType {
  Integer = 'int',
  Float = 'float',
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

  CAST = 'as',
}

export const getTypeForBinaryOp = (
  op: string,
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

export type ExprOp = Exclude<BinaryOp, BinaryOp.CALL>;
export enum UnaryOp {
  DEREF = '@',
}
