import { OrderedMap } from '../../utils/data-structures/OrderedMap.js';
import { FuncType, Intrinsics, RecordType, TupleType } from '../snax-types.js';
import {
  makeArgList,
  makeBlock,
  makeFile,
  makeFuncDecl,
  makeNumberLiteral,
  makeParameterList,
} from '../spec-gen.js';
import * as AST from '../spec-gen.js';
import { resolveTypes } from '../type-resolution.js';
import { resolveSymbols } from '../symbol-resolution.js';
import { makeNum } from './ast-util.js';

describe('ParameterList', () => {
  it('types an empty parameter list as a tuple type', () => {
    const params = makeParameterList([]);
    const typeMap = resolveTypes(params, new OrderedMap());
    expect(typeMap.get(params)).toEqual(new TupleType([]));
  });
});

describe('CastExpr', () => {
  it('types a cast expr as the type being casted to', () => {
    const typeRef = AST.makeTypeRef('f64');
    let cast = AST.makeCastExpr(makeNum(1), typeRef);
    const typeCache = resolveTypes(cast, new OrderedMap());
    expect(typeCache.get(cast)).toEqual(typeCache.get(typeRef));
  });
});

describe('Functions', () => {
  it('types an empty function as an empty func type', () => {
    const func = makeFuncDecl(
      'myFunc',
      makeParameterList([]),
      undefined,
      makeBlock([])
    );
    const typeMap = resolveTypes(func, new OrderedMap());
    expect(typeMap.get(func)).toEqual(new FuncType([], Intrinsics.void));
  });
  it('types a function with an explicit return type as a func type with that return type', () => {
    const func = makeFuncDecl(
      'myFunc',
      makeParameterList([]),
      AST.makeTypeRef('i32'),
      makeBlock([])
    );
    const typeMap = resolveTypes(func, new OrderedMap());
    expect(typeMap.get(func)).toEqual(new FuncType([], Intrinsics.i32));
  });
});

describe('ArgList', () => {
  it('types an arglist as a tuple type', () => {
    const arg1 = makeNumberLiteral(1, 'int', undefined);
    const arg2 = makeNumberLiteral(2.3, 'float', undefined);
    const argList = makeArgList([arg1, arg2]);
    const typeMap = resolveTypes(argList, new OrderedMap());
    expect(typeMap.get(argList)).toEqual(
      new TupleType([typeMap.get(arg1)!, typeMap.get(arg2)!])
    );
  });
});

describe('Files', () => {
  it('types an empty file as an empty record type', () => {
    const file = makeFile([], [], []);
    const typeMap = resolveTypes(file, new OrderedMap());
    expect(typeMap.get(file)).toEqual(new RecordType(new OrderedMap()));
  });
  it('puts function declarations in the record type', () => {
    const func = makeFuncDecl(
      'myFunc',
      makeParameterList([]),
      undefined,
      makeBlock([])
    );
    const file = makeFile([func], [], []);
    const typeMap = resolveTypes(file, new OrderedMap());
    expect(typeMap.get(file)).toEqual(
      new RecordType(new OrderedMap([['myFunc', typeMap.get(func)!]]))
    );
  });
});

describe('ExternDecl', () => {
  it('types an extern decl as a record type', () => {
    const fdWriteFunc = AST.makeFuncDeclWith({
      symbol: 'fd_write',
      parameters: AST.makeParameterList([
        AST.makeParameter('fileDescriptor', AST.makeTypeRef('i32')),
        AST.makeParameter('iovPointer', AST.makeTypeRef('i32')),
        AST.makeParameter('iovLength', AST.makeTypeRef('i32')),
        AST.makeParameter('numWrittenPointer', AST.makeTypeRef('i32')),
      ]),
      returnType: AST.makeTypeRef('i32'),
      body: AST.makeBlock([]),
    });
    const externDecl = AST.makeExternDeclWith({
      libName: 'wasi_unstable',
      funcs: [fdWriteFunc],
    });
    const { refMap } = resolveSymbols(externDecl);
    const typeMap = resolveTypes(externDecl, refMap);
    expect(typeMap.get(externDecl)).toEqual(
      new RecordType(new OrderedMap([['fd_write', typeMap.get(fdWriteFunc)]]))
    );
  });
});

describe('TupleStructDecl', () => {
  it('types tuple struct declarations as a tuple type', () => {
    const tupleDecl = AST.makeTupleStructDecl('Vector', [
      AST.makeTypeRef('u8'),
      AST.makeTypeRef('i32'),
    ]);

    const { refMap } = resolveSymbols(tupleDecl);
    const typeMap = resolveTypes(tupleDecl, refMap);
    expect(typeMap.get(tupleDecl)).toEqual(
      new TupleType([Intrinsics.u8, Intrinsics.i32])
    );
  });
});
