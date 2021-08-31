import * as StackIR from './stack-ir';

export abstract class BaseType {
  name: string;
  constructor(name: string) {
    this.name = name;
  }

  toValueType(): StackIR.NumberType {
    throw new Error(
      `BaseType: type ${this.name} does not have a corresponding value type`
    );
  }

  toString(): string {
    return this.name;
  }
}

abstract class BaseGenericType {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

export class NumericalType extends BaseType {
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
}

class UnknownType extends BaseType {
  constructor() {
    super('unknown');
  }
}

class BoolType extends BaseType {
  constructor() {
    super('bool');
  }
  toValueType(): StackIR.NumberType {
    return StackIR.NumberType.i32;
  }
}

export class ArrayType extends BaseType {
  elementType: BaseType;
  length: number;
  constructor(elementType: BaseType, length: number) {
    super(`${elementType}[]`);
    this.elementType = elementType;
    this.length = length;
  }
  toValueType(): StackIR.NumberType {
    return StackIR.NumberType.i32;
  }
}

export class UnionType extends BaseType {
  constructor(memberTypes: BaseType[]) {
    super(memberTypes.map((t) => t.name).join(' | '));
  }
}

export class GenericType extends BaseGenericType {
  id: string;
  extendsType: BaseType;
  constructor(id: string, extendsType: BaseType) {
    super(`${id} extends ${extendsType.name}`);
    this.id = id;
    this.extendsType = extendsType;
  }
}

export class FuncType extends BaseType {
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
    throw new Error(
      'FuncType: func types do not have a corresponding value type... yet'
    );
  }
}

export class GenericFuncType extends BaseGenericType {
  genericTypes: { [id: string]: GenericType };
  argTypes: (BaseType | string)[];
  returnType: BaseType | string;
  constructor(
    genericTypes: { [id: string]: GenericType },
    argTypes: (BaseType | string)[],
    returnType: BaseType | string
  ) {
    const genericsStr = Object.values(genericTypes)
      .map((g) => g.name)
      .join(', ');
    const argsStr = argTypes
      .map((at) => (typeof at === 'string' ? at : at.name))
      .join(', ');
    const returnStr =
      typeof returnType === 'string' ? returnType : returnType.name;
    super(`func<${genericsStr}>(${argsStr}):${returnStr}`);
    this.genericTypes = genericTypes;
    this.argTypes = argTypes;
    this.returnType = returnType;
  }

  resolveGenerics(inputArgTypes: BaseType[]): FuncType {
    if (inputArgTypes.length !== this.argTypes.length) {
      throw new Error(
        `GenericFuncType: expected ${this.argTypes.length} arguments, got ${inputArgTypes.length}`
      );
    }
    const resolvedGenerics: { [id: string]: BaseType } = {};
    for (const [i, argType] of this.argTypes.entries()) {
      const inputArgType = inputArgTypes[i];
      if (typeof argType === 'string') {
        const generic = this.genericTypes[argType];
        const resolved = resolvedGenerics[generic.id];
        if (resolved) {
          if (inputArgType !== resolved) {
            throw new Error(
              `GenericFuncType: arg ${i} must be ${resolved.name}, got ${inputArgType.name}`
            );
          }
        } else {
          resolvedGenerics[generic.id] = inputArgType;
        }
      }
    }

    let returnType: BaseType;
    if (typeof this.returnType === 'string') {
      const resolved = resolvedGenerics[this.returnType];
      if (resolved) {
        returnType = resolved;
      } else {
        throw new Error(
          `GenericFuncType: Could not resolve generic type ${this.returnType}`
        );
      }
    } else {
      returnType = this.returnType;
    }

    return new FuncType(inputArgTypes, returnType);
  }
}

export const Intrinsics = {
  i32: new NumericalType('i32', 'int', 4),
  i64: new NumericalType('i64', 'int', 8),
  f32: new NumericalType('f32', 'float', 4),
  f64: new NumericalType('f64', 'float', 8),
  Void: new VoidType(),
  Unknown: new UnknownType(),
  Bool: new BoolType(),
};
const { i32, i64, f32, f64 } = Intrinsics;
export const Operators = {
  i32Add: new FuncType([i32, i32], i32),
  Add: new GenericFuncType(
    { T: new GenericType('T', new UnionType([i32, i64, f32, f64])) },
    ['T', 'T'],
    'T'
  ),
};
export type { VoidType, UnknownType };
