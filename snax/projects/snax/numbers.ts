/**
 * Number Types. Basically the same as:
 * https://webassembly.github.io/spec/core/syntax/types.html#number-types
 */

export enum NumberType {
  i32 = 'i32',
  i64 = 'i64',
  f32 = 'f32',
  f64 = 'f64',
}

export type IntegerType = NumberType.i32 | NumberType.i64;
export type FloatType = NumberType.f32 | NumberType.f64;
export function isIntType(t: NumberType): t is IntegerType {
  return t === NumberType.i32 || t === NumberType.i64;
}
export function isFloatType(t: NumberType): t is FloatType {
  return t === NumberType.f32 || t === NumberType.f64;
}

export enum Sign {
  Signed = 's',
  Unsigned = 'u',
}
