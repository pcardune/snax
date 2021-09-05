import { OrderedMap } from '../../utils/data-structures/OrderedMap';
import { FuncType, Intrinsics, RecordType, TupleType } from '../snax-types';
import {
  makeArgList,
  makeBlock,
  makeFile,
  makeFuncDecl,
  makeNumberLiteral,
  makeParameterList,
} from '../spec-gen';
import { resolveTypes } from '../type-resolution';
import { makeNum } from './ast-util';

describe('ParameterList', () => {
  it('types an empty parameter list as a tuple type', () => {
    const params = makeParameterList([]);
    const typeMap = resolveTypes(params, new OrderedMap());
    expect(typeMap.get(params)).toEqual(new TupleType([]));
  });
});

describe('Functions', () => {
  it('types an empty function as an empty func type', () => {
    const func = makeFuncDecl(
      'myFunc',
      makeParameterList([]),
      null,
      makeBlock([])
    );
    const typeMap = resolveTypes(func, new OrderedMap());
    expect(typeMap.get(func)).toEqual(new FuncType([], Intrinsics.void));
  });
});

describe('ArgList', () => {
  it('types an arglist as a tuple type', () => {
    const arg1 = makeNumberLiteral(1, 'int', null);
    const arg2 = makeNumberLiteral(2.3, 'float', null);
    const argList = makeArgList([arg1, arg2]);
    const typeMap = resolveTypes(argList, new OrderedMap());
    expect(typeMap.get(argList)).toEqual(
      new TupleType([typeMap.get(arg1)!, typeMap.get(arg2)!])
    );
  });
});

describe('Files', () => {
  it('types an empty file as an empty record type', () => {
    const file = makeFile([], []);
    const typeMap = resolveTypes(file, new OrderedMap());
    expect(typeMap.get(file)).toEqual(new RecordType(new OrderedMap()));
  });
  it('puts function declarations in the record type', () => {
    const func = makeFuncDecl(
      'myFunc',
      makeParameterList([]),
      null,
      makeBlock([])
    );
    const file = makeFile([func], []);
    const typeMap = resolveTypes(file, new OrderedMap());
    expect(typeMap.get(file)).toEqual(
      new RecordType(new OrderedMap([['myFunc', typeMap.get(func)!]]))
    );
  });
});
