import * as StackIR from './stack-ir';

export abstract class BaseType {
  name: string;
  constructor(name: string) {
    this.name = name;
  }

  abstract toValueType(): StackIR.NumberType;

  toString(): string {
    return this.name;
  }
}

class NumericalType extends BaseType {
  // The size in bytes
  size: number;
  interpretation: 'float' | 'int';
  constructor(name: string, interpretation: 'float' | 'int', size: number) {
    super(name);
    this.interpretation = interpretation;
    this.size = size;
  }
  toString() {
    return `${this.interpretation}${this.size * 8}`;
  }
  toValueType(): StackIR.NumberType {
    const { i32, i64, f32, f64 } = StackIR.NumberType;
    if (this.interpretation === 'float') {
      if (this.size <= 4) {
        return f32;
      } else if (this.size <= 8) {
        return f64;
      } else {
        throw new Error(
          "Don't know how to store numbers with more than 8 bytes yet"
        );
      }
    } else {
      if (this.size <= 4) {
        return i32;
      } else if (this.size <= 8) {
        return i64;
      } else {
        throw new Error(
          "Don't know how to store numbers with more than 8 bytes yet"
        );
      }
    }
  }
}

class VoidType extends BaseType {
  constructor() {
    super('void');
  }
  toValueType(): StackIR.NumberType {
    throw new Error('void types do not have a corresponding value type');
  }
}

class UnknownType extends BaseType {
  constructor() {
    super('unknown');
  }
  toValueType(): StackIR.NumberType {
    throw new Error('unknown types do not have a corresponding value type');
  }
}

class FuncType extends BaseType {
  argTypes: BaseType[];
  returnType: BaseType;
  constructor(argTypes: BaseType[], returnType: BaseType) {
    super(
      `func(${argTypes.map((at) => at.name).join(', ')}):${returnType.name}`
    );
    this.argTypes = argTypes;
    this.returnType = returnType;
  }

  toValueType(): StackIR.NumberType {
    throw new Error('func types do not have a corresponding value type... yet');
  }
}

export const Intrinsics = {
  i32: new NumericalType('i32', 'int', 4),
  i64: new NumericalType('i64', 'int', 8),
  f32: new NumericalType('f32', 'float', 4),
  f64: new NumericalType('f64', 'float', 8),
  Void: new VoidType(),
  Unknown: new UnknownType(),
};
const { i32, i64, f32, f64 } = Intrinsics;
export const Operators = {
  i32Add: new FuncType([i32, i32], i32),
};
export type { VoidType, UnknownType, NumericalType };
