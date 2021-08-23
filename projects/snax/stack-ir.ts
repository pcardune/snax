import { HasWAT } from './wat-compiler';

export enum Type {
  i32 = 'i32',
  i64 = 'i64',
}

export class PushConst implements HasWAT {
  valueType: Type;
  value: number;
  constructor(valueType: Type, value: number) {
    this.valueType = valueType;
    this.value = value;
  }
  toWAT(): string {
    return `${this.valueType}.const ${this.value}`;
  }
}

class BinaryOp {
  valueType: Type;
  constructor(valueType: Type) {
    this.valueType = valueType;
  }
}

export class Add extends BinaryOp implements HasWAT {
  toWAT(): string {
    return `${this.valueType}.add`;
  }
}

export class Sub extends BinaryOp implements HasWAT {
  toWAT(): string {
    return `${this.valueType}.sub`;
  }
}

export class Mul extends BinaryOp implements HasWAT {
  toWAT(): string {
    return `${this.valueType}.mul`;
  }
}

export class Div extends BinaryOp implements HasWAT {
  toWAT(): string {
    return `${this.valueType}.div_s`;
  }
}

export type Instruction = PushConst | Add | Sub;

export interface HasStackIR {
  toStackIR(): Instruction[];
}

export function hasStackIR(item: any): item is HasStackIR {
  return !!item.toStackIR;
}
