import { OrderedMap } from '../../utils/data-structures/OrderedMap.js';
import {
  ArrayType,
  FuncType,
  Intrinsics,
  RecordType,
  TupleType,
} from '../snax-types.js';
import {
  makeArgList,
  makeBlock,
  makeFile,
  makeNumberLiteral,
  makeParameterList,
} from '../spec-gen.js';
import * as AST from '../spec-gen.js';
import { resolveTypes } from '../type-resolution.js';
import { resolveSymbols } from '../symbol-resolution.js';
import { makeNum } from '../ast-util.js';
import { BinOp } from '../snax-ast.js';

describe('ParameterList', () => {
  it('types an empty parameter list as a tuple type', () => {
    const params = makeParameterList([]);
    const typeMap = resolveTypes(params, new OrderedMap());
    expect(typeMap.get(params)).toEqual(new TupleType([]));
  });
});

describe('CastExpr', () => {
  it('types a cast expr as the type being casted to', () => {
    const typeRef = AST.makeTypeRef(AST.makeSymbolRef('f64'));
    let cast = AST.makeCastExpr(makeNum(1), typeRef, false);
    const typeCache = resolveTypes(cast, new OrderedMap());
    expect(typeCache.get(cast)).toEqual(typeCache.get(typeRef));
  });
});

describe('NumberLiteral', () => {
  it('throws an error if a type hinted number will not fit', () => {
    const typedNumber = AST.makeNumberLiteral('45452', 'int', 'u8');
    expect(() =>
      resolveTypes(typedNumber, new OrderedMap())
    ).toThrowErrorMatchingInlineSnapshot(
      `"TypeResolutionError at <unknown>: 45452 doesn't fit into a u8"`
    );
  });

  it('throws an error if a type hinted number will not fit into a signed int', () => {
    const typedNumber = AST.makeNumberLiteral('250', 'int', 'i8');
    expect(() =>
      resolveTypes(typedNumber, new OrderedMap())
    ).toThrowErrorMatchingInlineSnapshot(
      `"TypeResolutionError at <unknown>: 250 doesn't fit into a i8"`
    );
  });

  it('uses type hints to determine the types of number literals', () => {
    const explicitNumber = AST.makeNumberLiteral('8', 'int', 'u8');
    const inferredNumber = AST.makeNumberLiteral('3', 'int', undefined);
    const add = AST.makeBinaryExpr(BinOp.ADD, explicitNumber, inferredNumber);
    const typeMap = resolveTypes(add, new OrderedMap());
    expect(typeMap.get(inferredNumber)).toBe(Intrinsics.u8);
  });
  it('throws an error if a type hinted number will not fit', () => {
    const explicitNumber = AST.makeNumberLiteral('8', 'int', 'u8');
    const inferredNumber = AST.makeNumberLiteral('45452', 'int', undefined);
    const add = AST.makeBinaryExpr(BinOp.ADD, explicitNumber, inferredNumber);
    expect(() =>
      resolveTypes(add, new OrderedMap())
    ).toThrowErrorMatchingInlineSnapshot(
      `"TypeResolutionError at <unknown>: 45452 doesn't fit into a u8"`
    );
  });
});

describe('Functions', () => {
  const makeFunc = (
    symbol: string,
    params?: AST.Parameter[],
    returnType?: AST.TypeExpr,
    body?: AST.Statement[]
  ) => {
    return AST.makeFuncDeclWith({
      symbol,
      parameters: makeParameterList(params ?? []),
      returnType,
      body: makeBlock(body ?? []),
    });
  };

  it('types an empty function as func():void', () => {
    const func = makeFunc('myFunc', [], undefined, []);
    const typeMap = resolveTypes(func, new OrderedMap());
    expect(typeMap.get(func)).toEqual(new FuncType([], Intrinsics.void));
    expect(typeMap.get(func).name).toMatchInlineSnapshot(`"func():void"`);
  });
  it('types a function with an explicit return type as a func type with that return type', () => {
    const func = makeFunc(
      'myFunc',
      [],
      AST.makeTypeRef(AST.makeSymbolRef('i32')),
      [AST.makeReturnStatement(AST.makeNumberLiteral('1', 'int', undefined))]
    );
    const typeMap = resolveTypes(func, new OrderedMap());
    expect(typeMap.get(func)).toEqual(new FuncType([], Intrinsics.i32));
  });
  it('Checks that a function with an explicit return type actually returns that type', () => {
    const func = makeFunc(
      'myFunc',
      [],
      AST.makeTypeRef(AST.makeSymbolRef('i32')),
      []
    );
    expect(() =>
      resolveTypes(func, new OrderedMap())
    ).toThrowErrorMatchingInlineSnapshot(
      `"TypeResolutionError at <unknown>: FuncDecl: function myFunc must return i32 but has no return statements"`
    );
  });
  it('Allows a function with an explicit void return type to have no return statements', () => {
    const func = makeFunc(
      'myFunc',
      [],
      AST.makeTypeRef(AST.makeSymbolRef('void')),
      []
    );
    expect(() => resolveTypes(func, new OrderedMap())).not.toThrow();
  });
  describe('without an explicit return type', () => {
    it('infer the return type from the return statements in the function', () => {
      const func = makeFunc('myFunc', [], undefined, [
        AST.makeReturnStatement(AST.makeNumberLiteral('1', 'int', undefined)),
      ]);
      const typeMap = resolveTypes(func, new OrderedMap());
      expect(typeMap.get(func)).toEqual(new FuncType([], Intrinsics.i32));
    });
    it('Fail if there are multiple return statements with conflicting types', () => {
      const func = makeFunc('myFunc', [], undefined, [
        AST.makeReturnStatement(AST.makeNumberLiteral('1', 'int', undefined)),
        AST.makeReturnStatement(AST.makeNumberLiteral('1', 'float', undefined)),
      ]);
      expect(() =>
        resolveTypes(func, new OrderedMap())
      ).toThrowErrorMatchingInlineSnapshot(
        `"TypeResolutionError at <unknown>: FuncDecl: can't resolve type for function myFunc: return statements have varying types. Expected i32, found f32"`
      );
    });
  });
});

describe('ArgList', () => {
  it('types an arglist as a tuple type', () => {
    const arg1 = makeNumberLiteral('1', 'int', undefined);
    const arg2 = makeNumberLiteral('2.3', 'float', undefined);
    const argList = makeArgList([arg1, arg2]);
    const typeMap = resolveTypes(argList, new OrderedMap());
    expect(typeMap.get(argList)).toEqual(
      new TupleType([typeMap.get(arg1)!, typeMap.get(arg2)!])
    );
  });
});

describe('Files', () => {
  it('types an empty file as an empty record type', () => {
    const file = makeFile([]);
    const typeMap = resolveTypes(file, new OrderedMap());
    expect(typeMap.get(file)).toEqual(new RecordType(new OrderedMap()));
  });
  it('puts function declarations in the record type', () => {
    const func = AST.makeFuncDeclWith({
      symbol: 'myFunc',
      parameters: makeParameterList([]),
      body: makeBlock([]),
    });
    const file = makeFile([func]);
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
      typeExpr: AST.makeTypeRef(AST.makeSymbolRef('f32')),
      expr: undefined,
    });
    expect(getType(letStatement)).toBe(Intrinsics.f32);
  });

  it('uses the type of the initializer expression if no explicit type is specified', () => {
    const letStatement = AST.makeLetStatementWith({
      symbol: 'x',
      typeExpr: undefined,
      expr: AST.makeNumberLiteral('3.14', 'float', 'f64'),
    });
    expect(getType(letStatement)).toBe(Intrinsics.f64);
  });

  it('Ensures that the intialization expression type matches the let statement type', () => {
    const letStatement = AST.makeLetStatementWith({
      symbol: 'x',
      typeExpr: AST.makeTypeRef(AST.makeSymbolRef('i32')),
      expr: AST.makeNumberLiteral('3', 'int', 'i32'),
    });
    expect(getType(letStatement)).toBe(Intrinsics.i32);

    const badLetStatement = AST.makeLetStatementWith({
      symbol: 'x',
      typeExpr: AST.makeTypeRef(AST.makeSymbolRef('i32')),
      expr: AST.makeNumberLiteral('3', 'int', 'f64'),
    });
    expect(() => getType(badLetStatement)).toThrowErrorMatchingInlineSnapshot(
      `"TypeResolutionError at <unknown>: LetStatement has explicit type i32 but is being initialized to incompatible type f64."`
    );
  });

  it('uses assignments to infer the type', () => {
    const letStatement = AST.makeLetStatementWith({
      symbol: 'x',
      typeExpr: undefined,
      expr: undefined,
    });
    const assign = AST.makeBinaryExpr(
      BinOp.ASSIGN,
      AST.makeSymbolRef('x'),
      AST.makeNumberLiteral('1', 'int', undefined)
    );
    const assignStatement = AST.makeExprStatement(assign);
    const block = AST.makeBlock([letStatement, assignStatement]);
    const { refMap } = resolveSymbols(block);
    const typeMap = resolveTypes(block, refMap);
    expect(typeMap.get(letStatement)).toEqual(Intrinsics.i32);
  });

  it('throws when inferences determines multiple types', () => {
    const letStatement = AST.makeLetStatementWith({
      symbol: 'x',
      typeExpr: undefined,
      expr: undefined,
    });
    const block = AST.makeBlock([
      letStatement,
      AST.makeExprStatement(
        AST.makeBinaryExpr(
          BinOp.ASSIGN,
          AST.makeSymbolRef('x'),
          AST.makeNumberLiteral('1', 'int', undefined)
        )
      ),
      AST.makeExprStatement(
        AST.makeBinaryExpr(
          BinOp.ASSIGN,
          AST.makeSymbolRef('x'),
          AST.makeNumberLiteral('1.34', 'float', undefined)
        )
      ),
    ]);
    const { refMap } = resolveSymbols(block);
    expect(() =>
resolveTypes(block, refMap)
).toThrowErrorMatchingInlineSnapshot(`"TypeResolutionError at <unknown>: 1.34 doesn't fit into a i32"`);
  });
});

describe('ExternDecl', () => {
  it('types an extern decl as a record type', () => {
    const fdWriteFunc = AST.makeExternFuncDeclWith({
      symbol: 'fd_write',
      parameters: AST.makeParameterList([
        AST.makeParameter(
          'fileDescriptor',
          AST.makeTypeRef(AST.makeSymbolRef('i32'))
        ),
        AST.makeParameter(
          'iovPointer',
          AST.makeTypeRef(AST.makeSymbolRef('i32'))
        ),
        AST.makeParameter(
          'iovLength',
          AST.makeTypeRef(AST.makeSymbolRef('i32'))
        ),
        AST.makeParameter(
          'numWrittenPointer',
          AST.makeTypeRef(AST.makeSymbolRef('i32'))
        ),
      ]),
      returnType: AST.makeTypeRef(AST.makeSymbolRef('void')),
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

describe('ArrayLiteral', () => {
  it('types an array literal as an ArrayType', () => {
    const arrayLiteral = AST.makeArrayLiteralWith({
      elements: [makeNum(3), makeNum(4), makeNum(5)],
    });
    expect(getType(arrayLiteral)).toEqual(new ArrayType(Intrinsics.i32, 3));
  });

  it('throws a type error if the elements have different types', () => {
    const arrayLiteral = AST.makeArrayLiteralWith({
      elements: [makeNum(3), makeNum(4, 'float'), makeNum(5)],
    });
    expect(() => getType(arrayLiteral)).toThrowErrorMatchingInlineSnapshot(
      `"TypeResolutionError at <unknown>: Can't have an array with mixed types. Expected i32, found f32"`
    );
  });

  it('types an array literal with a size entry correctly', () => {
    const arrayLiteral = AST.makeArrayLiteralWith({
      elements: [makeNum(3)],
      size: makeNum(45),
    });
    expect(getType(arrayLiteral)).toEqual(new ArrayType(Intrinsics.i32, 45));
  });

  it('types array indexing correctly', () => {
    const arrayLiteral = AST.makeArrayLiteralWith({
      elements: [makeNum(3)],
      size: makeNum(45),
    });
    expect(
      getType(AST.makeBinaryExpr(BinOp.ARRAY_INDEX, arrayLiteral, makeNum(1)))
    ).toEqual(Intrinsics.i32);
  });
  it('types multi-dimensional array indexing correctly', () => {
    const arrayLiteral = AST.makeArrayLiteralWith({
      elements: [
        AST.makeArrayLiteralWith({ elements: [makeNum(1), makeNum(2)] }),
        AST.makeArrayLiteralWith({ elements: [makeNum(3), makeNum(4)] }),
      ],
    });
    expect(
      getType(
        AST.makeBinaryExpr(
          BinOp.ARRAY_INDEX,
          AST.makeBinaryExpr(BinOp.ARRAY_INDEX, arrayLiteral, makeNum(1)),
          makeNum(0)
        )
      )
    ).toEqual(Intrinsics.i32);
  });
});

describe('TupleStructDecl', () => {
  it('types tuple struct declarations as a tuple type', () => {
    const tupleDecl = AST.makeTupleStructDecl('Vector', [
      AST.makeTypeRef(AST.makeSymbolRef('u8')),
      AST.makeTypeRef(AST.makeSymbolRef('i32')),
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
        AST.makeStructProp('x', AST.makeTypeRef(AST.makeSymbolRef('i32'))),
        AST.makeStructProp('y', AST.makeTypeRef(AST.makeSymbolRef('i32'))),
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

  it('allows struct declarations to reference other structs', () => {
    const vecStructDecl = AST.makeStructDeclWith({
      symbol: 'Vector',
      props: [
        AST.makeStructProp('x', AST.makeTypeRef(AST.makeSymbolRef('i32'))),
        AST.makeStructProp('y', AST.makeTypeRef(AST.makeSymbolRef('i32'))),
      ],
    });
    const lineStructDecl = AST.makeStructDeclWith({
      symbol: 'Line',
      props: [
        AST.makeStructProp('p1', AST.makeTypeRef(AST.makeSymbolRef('Vector'))),
        AST.makeStructProp('p2', AST.makeTypeRef(AST.makeSymbolRef('Vector'))),
      ],
    });
    const file = AST.makeFileWith({
      decls: [vecStructDecl, lineStructDecl],
    });
    const { refMap } = resolveSymbols(file);
    const typeMap = resolveTypes(file, refMap);
    expect(typeMap.get(lineStructDecl).name).toEqual(
      '{p1: {x: i32, y: i32}, p2: {x: i32, y: i32}}'
    );
  });

  it('does not allow recursive structs', () => {
    const vecStructDecl = AST.makeStructDeclWith({
      symbol: 'Vector',
      props: [
        AST.makeStructProp('x', AST.makeTypeRef(AST.makeSymbolRef('i32'))),
        AST.makeStructProp('y', AST.makeTypeRef(AST.makeSymbolRef('Vector'))),
      ],
    });
    const file = AST.makeFileWith({
      decls: [vecStructDecl],
    });
    const { refMap } = resolveSymbols(file);
    expect(() => resolveTypes(file, refMap)).toThrowErrorMatchingInlineSnapshot(
      `"TypeResolutionError at <unknown>: Detected cycle in type references"`
    );
  });
});
