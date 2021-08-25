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
  | LocalSet;

export interface HasStackIR {
  toStackIR(): Instruction[];
}

export function hasStackIR(item: any): item is HasStackIR {
  return !!item.toStackIR;
}
