import type { OrderedMap } from '../utils/data-structures/OrderedMap.js';
import { NumberType, Sign } from './numbers.js';

export abstract class BaseType {
  name: string;
  constructor(name: string) {
    this.name = name;
  }

  toValueType(): NumberType | undefined {
    return undefined;
  }

  toValueTypeOrThrow(): NumberType {
    const valueType = this.toValueType();
    if (valueType === undefined) {
      throw new Error(
        `BaseType: type ${this.name} does not have a corresponding value type`
      );
    }
    return valueType;
  }

  abstract get numBytes(): number;

  toString(): string {
    return this.name;
  }

  equals(other: BaseType) {
    // TODO: decide about this: https://github.com/pcardune/snax/issues/2
    return this.name === other.name;
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
  numBytes: number;
  interpretation: 'float' | 'int';
  sign: Sign;
  constructor(
    name: string,
    interpretation: 'float' | 'int',
    size: number,
    signed: Sign
  ) {
    super(name);
    this.interpretation = interpretation;
    this.numBytes = size;
    this.sign = signed;
  }
  toValueType(): NumberType {
    const { i32, i64, f32, f64 } = NumberType;
    if (this.interpretation === 'float') {
      if (this.numBytes <= 4) {
        return f32;
      } else if (this.numBytes <= 8) {
        return f64;
      } else {
        throw new Error(
          "Don't know how to store numbers with more than 8 bytes yet"
        );
      }
    } else {
      if (this.numBytes <= 4) {
        return i32;
      } else if (this.numBytes <= 8) {
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
  numBytes = 0;
  constructor() {
    super('void');
  }
}

class UnknownType extends BaseType {
  get numBytes(): number {
    throw new Error('unknown type has an unknown number of bytes');
  }
  constructor() {
    super('unknown');
  }
}

class BoolType extends BaseType {
  numBytes = 1;
  constructor() {
    super('bool');
  }
  toValueType(): NumberType {
    return NumberType.i32;
  }
}

export class PointerType extends BaseType {
  numBytes = 4;
  toType: BaseType;
  constructor(toType: BaseType) {
    super(`&${toType.name}`);
    this.toType = toType;
  }
  toValueType() {
    return NumberType.i32;
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
  get numBytes() {
    return this.elementType.numBytes * this.length;
  }
  toValueType(): NumberType {
    return NumberType.i32;
  }
}

export class RecordType extends BaseType {
  fields: OrderedMap<string, { type: BaseType; offset: number }>;
  numBytes: number;
  constructor(fields: OrderedMap<string, BaseType>) {
    const name = fields
      .entries()
      .map(([i, name, type]) => `${name}: ${type.name}`)
      .toArray()
      .join(', ');
    super(`{` + name + `}`);
    this.numBytes = 0;
    this.fields = fields.map((type) => {
      const elem = { type, offset: this.numBytes };
      this.numBytes += type.numBytes;
      return elem;
    });
  }
}

export class TupleType extends BaseType {
  elements: { type: BaseType; offset: number }[];
  numBytes: number = 0;
  constructor(elements: BaseType[]) {
    super(`(${elements.map((e) => e.name).join(', ')})`);
    this.elements = elements.map((type) => {
      const elem = { type, offset: this.numBytes };
      this.numBytes += type.numBytes;
      return elem;
    });
  }
}

export class UnionType extends BaseType {
  memberTypes: BaseType[];
  constructor(memberTypes: BaseType[]) {
    super(memberTypes.map((t) => t.name).join(' | '));
    this.memberTypes = memberTypes;
  }
  get numBytes() {
    return Math.max(...this.memberTypes.map((t) => t.numBytes));
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
  numBytes = 0;
  argTypes: BaseType[];
  returnType: BaseType;
  constructor(argTypes: BaseType[], returnType: BaseType) {
    super(
      `func(${argTypes.map((at) => at.name).join(', ')}):${returnType.name}`
    );
    this.argTypes = argTypes;
    this.returnType = returnType;
  }

  toValueType(): NumberType {
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

const instrinsicNames = [
  'u8',
  'u16',
  'u32',
  'u64',
  'usize',
  'i8',
  'i16',
  'i32',
  'i64',
  'f32',
  'f64',
  'void',
  'unknown',
  'bool',
] as const;

export const Intrinsics: Record<typeof instrinsicNames[number], BaseType> = {
  u8: new NumericalType('u8', 'int', 1, Sign.Unsigned),
  u16: new NumericalType('u16', 'int', 2, Sign.Unsigned),
  u32: new NumericalType('u32', 'int', 4, Sign.Unsigned),
  u64: new NumericalType('u64', 'int', 8, Sign.Unsigned),
  usize: new NumericalType('u32', 'int', 4, Sign.Unsigned),
  i8: new NumericalType('i8', 'int', 1, Sign.Signed),
  i16: new NumericalType('i16', 'int', 2, Sign.Signed),
  i32: new NumericalType('i32', 'int', 4, Sign.Signed),
  i64: new NumericalType('i64', 'int', 8, Sign.Signed),
  f32: new NumericalType('f32', 'float', 4, Sign.Signed),
  f64: new NumericalType('f64', 'float', 8, Sign.Signed),
  void: new VoidType(),
  unknown: new UnknownType(),
  bool: new BoolType(),
};

Intrinsics.usize = Intrinsics.u32;

export function isIntrinsicSymbol(
  symbol: string
): symbol is typeof instrinsicNames[number] {
  return instrinsicNames.includes(symbol as any);
}
export type { VoidType, UnknownType };
