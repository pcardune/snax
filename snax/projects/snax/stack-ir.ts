import { HasWAT } from './wat-compiler.js';

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

export enum Sign {
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

abstract class BaseConversion<
  Source extends NumberType,
  Dest extends NumberType
> extends Instruction {
  sourceType: Source;
  destType: Dest;
  abstract get name(): string;

  constructor(sourceType: Source, destType: Dest) {
    super();
    this.sourceType = sourceType;
    this.destType = destType;
  }
  toWAT(): string {
    return `${this.destType}.${this.name}_${this.sourceType}`;
  }
}

export class Convert extends BaseConversion<IntegerType, FloatType> {
  sign: Sign;
  name = 'convert';
  constructor(
    sourceType: IntegerType,
    destType: FloatType,
    sign: Sign = Sign.Signed
  ) {
    super(sourceType, destType);
    this.sign = sign;
  }
  toWAT(): string {
    return `${super.toWAT()}_${this.sign}`;
  }
}

export class Promote extends BaseConversion<NumberType.f32, NumberType.f64> {
  name = 'promote';
  constructor() {
    super(NumberType.f32, NumberType.f64);
  }
}

export class Nop extends Instruction {
  toWAT() {
    return 'nop';
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

export class Rem extends BinaryOp {
  instruction = 'rem_s';
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

abstract class VariableGet extends Instruction {
  offset: number;
  constructor(offset: number) {
    super();
    this.offset = offset;
  }
}

export class LocalGet extends VariableGet {
  toWAT(): string {
    return `local.get ${this.offset}`;
  }
}
export class GlobalGet extends VariableGet {
  toWAT(): string {
    return `global.get ${this.offset}`;
  }
}

export class Return extends Instruction {
  toWAT() {
    return 'return';
  }
}

export class Drop extends Instruction {
  toWAT() {
    return 'drop';
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
export class LocalTee extends Instruction {
  offset: number;
  constructor(offset: number) {
    super();
    this.offset = offset;
  }
  toWAT(): string {
    return `local.tee ${this.offset}`;
  }
}
export class GlobalSet extends Instruction {
  offset: number;
  constructor(offset: number) {
    super();
    this.offset = offset;
  }
  toWAT(): string {
    return `global.set ${this.offset}`;
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

abstract class MemoryInstr extends Instruction {
  valueType: NumberType;
  offset: number;
  align: number;
  bytes: 1 | 2 | 4 | 8 = 4;
  constructor(
    valueType: NumberType,
    props: { offset?: number; align?: number; bytes?: number } = {}
  ) {
    super();
    this.valueType = valueType;
    this.offset = props.offset ?? 0;
    this.align = props.align ?? 1;
    const { bytes } = props;
    if (bytes) {
      if (
        bytes !== 1 &&
        bytes !== 2 &&
        bytes !== 4 &&
        !(bytes === 8 && valueType === 'i64')
      ) {
        throw new Error(
          `Can't store/load ${bytes} bytes to memory from/to ${valueType} using store/load instruction.`
        );
      }
      this.bytes = bytes;
    } else {
      switch (valueType) {
        case 'i32':
          this.bytes = 4;
          break;
        case 'i64':
          this.bytes = 8;
          break;
      }
    }
  }
}

export class MemoryLoad extends MemoryInstr {
  sign: Sign;
  constructor(
    valueType: NumberType,
    props: { offset?: number; align?: number; bytes?: number; sign?: Sign } = {}
  ) {
    const { sign, ...rest } = props;
    super(valueType, rest);
    this.sign = sign ?? Sign.Signed;
  }
  toWAT(): string {
    let after = '';
    if (this.bytes !== 4 || this.sign !== Sign.Signed) {
      after = `${this.bytes * 8}_${this.sign}`;
    }
    if (this.valueType === 'i32' && after === '32_u') {
      after = '';
    }

    const bits = this.bytes == 4 ? '' : 8 * this.bytes;
    return `${this.valueType}.load${after} offset=${this.offset} align=${this.align}`;
  }
}

export class MemoryStore extends MemoryInstr {
  toWAT(): string {
    const bits = this.bytes == 4 ? '' : 8 * this.bytes;
    return `${this.valueType}.store${bits} offset=${this.offset} align=${this.align}`;
  }
}

export class MemoryInit extends Instruction {
  dataidx: number;

  constructor(dataidx: number) {
    super();
    this.dataidx = dataidx;
  }

  toWAT(): string {
    return `memory.init ${this.dataidx}`;
  }
}

export type { Instruction };
