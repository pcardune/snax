export enum NumberLiteralType {
  Integer = 'int',
  Float = 'float',
}

export enum BinaryOp {
  MUL = '*',
  DIV = '/',
  ADD = '+',
  SUB = '-',
  REM = '%',

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

export type ExprOp = Exclude<BinaryOp, BinaryOp.CALL>;
export enum UnaryOp {
  DEREF = '@',
}
