import { HasWAT } from './wat-compiler';

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

abstract class Instruction implements HasWAT {
  abstract toWAT(): string;
}

export class PushConst extends Instruction {
  valueType: NumberType;
  value: number;
  constructor(valueType: NumberType, value: number) {
    super();
    this.valueType = valueType;
    this.value = value;
  }
  toWAT(): string {
    return `${this.valueType}.const ${this.value}`;
  }
}

export class Convert extends Instruction {
  sourceType: NumberType;
  destType: NumberType;
  sign: Sign;
  constructor(
    sourceType: IntegerType,
    destType: NumberType.f32 | NumberType.f64,
    sign: Sign = Sign.Signed
  ) {
    super();
    this.sourceType = sourceType;
    this.destType = destType;
    this.sign = sign;
  }
  toWAT(): string {
    return `${this.destType}.convert_${this.sourceType}_${this.sign}`;
  }
}

abstract class BinaryOp {
  valueType: NumberType;
  constructor(valueType: NumberType) {
    this.valueType = valueType;
  }
  abstract get instruction(): string;
  toWAT(): string {
    return `${this.valueType}.${this.instruction}`;
  }
}
export class Add extends BinaryOp {
  instruction = 'add';
}

export class Sub extends BinaryOp {
  instruction = 'sub';
}

export class Mul extends BinaryOp {
  instruction = 'mul';
}

export class Div extends BinaryOp {
  instruction = 'div_s';
}

export class And extends BinaryOp {
  instruction = 'and';
}

export class Or extends BinaryOp {
  instruction = 'or';
}

export class LessThan extends BinaryOp {
  get instruction() {
    switch (this.valueType) {
      case NumberType.f32:
      case NumberType.f64:
        return 'lt';
      case NumberType.i32:
      case NumberType.i64:
        return 'lt_s';
    }
  }
}

export class GreaterThan extends BinaryOp {
  get instruction() {
    switch (this.valueType) {
      case NumberType.f32:
      case NumberType.f64:
        return 'gt';
      case NumberType.i32:
      case NumberType.i64:
        return 'gt_s';
    }
  }
}

export class Equal extends BinaryOp {
  instruction = 'eq';
}

export class NotEqual extends BinaryOp {
  instruction = 'ne';
}

export class EqualsZero extends BinaryOp {
  instruction = 'eqz';
}

export class LocalGet extends Instruction {
  offset: number;
  constructor(offset: number) {
    super();
    this.offset = offset;
  }
  toWAT(): string {
    return `local.get ${this.offset}`;
  }
}

export class Return extends Instruction {
  toWAT() {
    return 'return';
  }
}

export class LocalSet extends Instruction {
  offset: number;
  constructor(offset: number) {
    super();
    this.offset = offset;
  }
  toWAT(): string {
    return `local.set ${this.offset}`;
  }
}

export class Call extends Instruction {
  offset: number;
  constructor(offset: number) {
    super();
    this.offset = offset;
  }
  toWAT() {
    return `call ${this.offset}`;
  }
}

export class BreakIf extends Instruction {
  label: string;
  constructor(label: string) {
    super();
    this.label = label;
  }
  toWAT(): string {
    return `br_if $${this.label}`;
  }
}

export class MemoryLoad extends Instruction {
  valueType: NumberType;
  offset: number;
  align: number;
  constructor(valueType: NumberType, offset: number = 0, align: number = 1) {
    super();
    this.valueType = valueType;
    this.offset = offset;
    this.align = align;
  }
  toWAT(): string {
    return `${this.valueType}.load offset=${this.offset} align=${this.align}`;
  }
}

export class MemoryStore extends Instruction {
  valueType: NumberType;
  offset: number;
  align: number;
  constructor(valueType: NumberType, offset: number = 0, align: number = 1) {
    super();
    this.valueType = valueType;
    this.offset = offset;
    this.align = align;
  }
  toWAT(): string {
    return `${this.valueType}.store offset=${this.offset} align=${this.align}`;
  }
}

export type { Instruction };
