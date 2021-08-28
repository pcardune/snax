import { HasWAT as IR } from './wat-compiler';

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
type IntegerType = NumberType.i32 | NumberType.i64;
type FloatType = NumberType.f32 | NumberType.f64;
export function isIntType(t: NumberType): t is IntegerType {
  return t === NumberType.i32 || t === NumberType.i64;
}
export function isFloatType(t: NumberType): t is FloatType {
  return t === NumberType.f32 || t === NumberType.f64;
}

enum Sign {
  Signed = 's',
  Unsigned = 'u',
}

export class PushConst implements IR {
  valueType: NumberType;
  value: number;
  constructor(valueType: NumberType, value: number) {
    this.valueType = valueType;
    this.value = value;
  }
  toWAT(): string {
    return `${this.valueType}.const ${this.value}`;
  }
}

class BinaryOp {
  valueType: NumberType;
  constructor(valueType: NumberType) {
    this.valueType = valueType;
  }
}

export class Convert implements IR {
  sourceType: NumberType;
  destType: NumberType;
  sign: Sign;
  constructor(
    sourceType: IntegerType,
    destType: NumberType.f32 | NumberType.f64,
    sign: Sign = Sign.Signed
  ) {
    this.sourceType = sourceType;
    this.destType = destType;
    this.sign = sign;
  }
  toWAT(): string {
    return `${this.destType}.convert_${this.sourceType}_${this.sign}`;
  }
}

export class Add extends BinaryOp implements IR {
  toWAT(): string {
    return `${this.valueType}.add`;
  }
}

export class Sub extends BinaryOp implements IR {
  toWAT(): string {
    return `${this.valueType}.sub`;
  }
}

export class Mul extends BinaryOp implements IR {
  toWAT(): string {
    return `${this.valueType}.mul`;
  }
}

export class Div extends BinaryOp implements IR {
  toWAT(): string {
    return `${this.valueType}.div_s`;
  }
}

export class LocalGet implements IR {
  offset: number;
  constructor(offset: number) {
    this.offset = offset;
  }
  toWAT(): string {
    return `local.get ${this.offset}`;
  }
}

export class LocalSet implements IR {
  offset: number;
  constructor(offset: number) {
    this.offset = offset;
  }
  toWAT(): string {
    return `local.set ${this.offset}`;
  }
}

export type Instruction =
  | PushConst
  | Add
  | Sub
  | Mul
  | Div
  | LocalGet
  | LocalSet
  | Convert;

export interface HasStackIR {
  toStackIR(): Instruction[];
}

export function hasStackIR(item: any): item is HasStackIR {
  return !!item.toStackIR;
}
