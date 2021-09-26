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
import { makeNum } from '../ast-util.js';

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
    let cast = AST.makeCastExpr(makeNum(1), typeRef, false);
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

/**
 * Helper function to get the type of a particular ast node,
 * that hasn't been processed in any way.
 * @param node Node to calculate the type for
 * @returns the type that the node will have in the type map.
 */
function getType(node: AST.ASTNode) {
  const { refMap } = resolveSymbols(node);
  const typeMap = resolveTypes(node, refMap);
  return typeMap.get(node);
}

describe('LetStatement', () => {
  it('uses the explicit type on the let statement', () => {
    const letStatement = AST.makeLetStatementWith({
      symbol: 'x',
      typeExpr: AST.makeTypeRef('f32'),
      expr: undefined,
    });
    expect(getType(letStatement)).toBe(Intrinsics.f32);
  });

  it('uses the type of the initializer expression if no explicit type is specified', () => {
    const letStatement = AST.makeLetStatementWith({
      symbol: 'x',
      typeExpr: undefined,
      expr: AST.makeNumberLiteral(3.14, 'float', 'f64'),
    });
    expect(getType(letStatement)).toBe(Intrinsics.f64);
  });

  it('Ensures that the intialization expression type matches the let statement type', () => {
    const letStatement = AST.makeLetStatementWith({
      symbol: 'x',
      typeExpr: AST.makeTypeRef('i32'),
      expr: AST.makeNumberLiteral(3, 'int', 'i32'),
    });
    expect(getType(letStatement)).toBe(Intrinsics.i32);

    const badLetStatement = AST.makeLetStatementWith({
      symbol: 'x',
      typeExpr: AST.makeTypeRef('i32'),
      expr: AST.makeNumberLiteral(3, 'int', 'f64'),
    });
    expect(() => getType(badLetStatement)).toThrowErrorMatchingInlineSnapshot(
      `"TypeResolutionError: LetStatement has explicit type i32 but is being initialized to incompatible type f64."`
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

describe('StructDecl', () => {
  it('types tuple struct declarations as a tuple type', () => {
    const structDecl = AST.makeStructDeclWith({
      symbol: 'Vector',
      props: [
        AST.makeStructProp('x', AST.makeTypeRef('i32')),
        AST.makeStructProp('y', AST.makeTypeRef('i32')),
        AST.makeFuncDeclWith({
          symbol: 'mag',
          parameters: AST.makeParameterList([]),
          body: AST.makeBlock([]),
        }),
      ],
    });

    const { refMap } = resolveSymbols(structDecl);
    const typeMap = resolveTypes(structDecl, refMap);
    const resolved = typeMap.get(structDecl);
    expect(resolved).toEqual(
      new RecordType(
        new OrderedMap([
          ['x', Intrinsics.i32],
          ['y', Intrinsics.i32],
          ['mag', new FuncType([], Intrinsics.void)],
        ])
      )
    );
    expect(resolved.name).toEqual('{x: i32, y: i32, mag: func():void}');
  });
});
