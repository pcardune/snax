import * as AST from '../spec-gen.js';
import * as IR from '../stack-ir.js';
import * as Wasm from '../wasm-ast.js';
import {
  BooleanLiteralCompiler,
  BinaryExprCompiler,
  FuncDeclCompiler,
  IfStatementCompiler,
  ModuleCompiler,
  WhileStatementCompiler,
  BlockCompiler,
  IRCompiler,
  IRCompilerContext,
  CompilesToIR,
} from '../ast-compiler.js';
import { makeFunc, makeNum } from './ast-util.js';
import { BinaryOp } from '../snax-ast.js';
import { resolveSymbols, SymbolRefMap } from '../symbol-resolution.js';
import { OrderedMap } from '../../utils/data-structures/OrderedMap.js';
import { ResolvedTypeMap, resolveTypes } from '../type-resolution.js';
import {
  AllocationMap,
  ModuleAllocator,
  NeverAllocator,
  resolveMemory,
} from '../memory-resolution.js';

function irCompiler(node: CompilesToIR) {
  const { refMap } = resolveSymbols(node);
  const typeCache = resolveTypes(node, refMap);
  return IRCompiler.forNode(node, {
    refMap,
    typeCache,
    allocationMap: new OrderedMap(),
    runtime: { malloc: { area: 'funcs', offset: 1000000 } },
  });
}

describe('BinaryExprCompiler', () => {
  const { i32, f32 } = IR.NumberType;
  test('compile() combines the stack IRS of the sub expressions', () => {
    const twenty = makeNum(20);
    const thirty = makeNum(30);
    const expr = AST.makeBinaryExpr(BinaryOp.ADD, twenty, thirty);
    const compiler = irCompiler(expr);
    expect(compiler.compile()).toEqual([
      ...compiler.compileChild(twenty),
      ...compiler.compileChild(thirty),
      new IR.Add(i32),
    ]);
  });
  it('casts integers to floats', () => {
    const ten = makeNum(10);
    const twelvePointThree = makeNum(12.3, 'float');
    let compiler = irCompiler(
      AST.makeBinaryExpr(BinaryOp.ADD, ten, twelvePointThree)
    );
    expect(compiler.compile()).toEqual([
      ...compiler.compileChild(ten),
      new IR.Convert(i32, f32),
      ...compiler.compileChild(twelvePointThree),
      new IR.Add(f32),
    ]);
    compiler = irCompiler(
      AST.makeBinaryExpr(BinaryOp.ADD, twelvePointThree, ten)
    );
    expect(compiler.compile()).toEqual([
      ...compiler.compileChild(twelvePointThree),
      ...compiler.compileChild(ten),
      new IR.Convert(i32, f32),
      new IR.Add(f32),
    ]);
  });
});

describe('BooleanLiteralCompiler', () => {
  it('compiles booleans to i32 consts', () => {
    expect(irCompiler(AST.makeBooleanLiteral(true)).compile()).toEqual([
      new IR.PushConst(IR.NumberType.i32, 1),
    ]);
    expect(irCompiler(AST.makeBooleanLiteral(false)).compile()).toEqual([
      new IR.PushConst(IR.NumberType.i32, 0),
    ]);
  });
});

describe('CastExprCompiler', () => {
  const { i32, i64, f32, f64 } = IR.NumberType;
  const { Signed, Unsigned } = IR.Sign;
  const noDropSign = new Error("I don't implicitly drop signs");
  const noTruncateFloat = new Error("I don't implicitly truncate floats");
  const noWrapBits = new Error("I don't implicitly wrap to smaller sizes");
  const noDemote = new Error("I don't implicitly demote floats");
  const cases: [string, string, IR.Instruction | Error][] = [
    // source type, destination type, instruction (or error)
    // convert to f64
    ['u8', 'f64', new IR.Convert(i32, f64, Unsigned)],
    ['u16', 'f64', new IR.Convert(i32, f64, Unsigned)],
    ['u32', 'f64', new IR.Convert(i32, f64, Unsigned)],
    ['u64', 'f64', new IR.Convert(i64, f64, Unsigned)],
    ['i8', 'f64', new IR.Convert(i32, f64, Signed)],
    ['i16', 'f64', new IR.Convert(i32, f64, Signed)],
    ['i32', 'f64', new IR.Convert(i32, f64, Signed)],
    ['i64', 'f64', new IR.Convert(i64, f64, Signed)],
    ['f32', 'f64', new IR.Promote()],
    ['f64', 'f64', new IR.Nop()],
    // convert to f32
    ['u8', 'f32', new IR.Convert(i32, f32, Unsigned)],
    ['u16', 'f32', new IR.Convert(i32, f32, Unsigned)],
    ['u32', 'f32', new IR.Convert(i32, f32, Unsigned)],
    ['u64', 'f32', new IR.Convert(i64, f32, Unsigned)],
    ['i8', 'f32', new IR.Convert(i32, f32, Signed)],
    ['i16', 'f32', new IR.Convert(i32, f32, Signed)],
    ['i32', 'f32', new IR.Convert(i32, f32, Signed)],
    ['i64', 'f32', new IR.Convert(i64, f32, Signed)],
    ['f32', 'f32', new IR.Nop()],
    ['f64', 'f32', noDemote],
    // convert to i64
    ['u8', 'i64', new IR.Nop()],
    ['u16', 'i64', new IR.Nop()],
    ['u32', 'i64', new IR.Nop()],
    ['u64', 'i64', new IR.Nop()],
    ['i8', 'i64', new IR.Nop()],
    ['i16', 'i64', new IR.Nop()],
    ['i32', 'i64', new IR.Nop()],
    ['i64', 'i64', new IR.Nop()],
    ['f32', 'i64', noTruncateFloat],
    ['f64', 'i64', noTruncateFloat],
    // convert to u64
    ['u8', 'u64', new IR.Nop()],
    ['u16', 'u64', new IR.Nop()],
    ['u32', 'u64', new IR.Nop()],
    ['u64', 'u64', new IR.Nop()],
    ['i8', 'u64', noDropSign],
    ['i16', 'u64', noDropSign],
    ['i32', 'u64', noDropSign],
    ['i64', 'u64', noDropSign],
    ['f32', 'u64', noTruncateFloat],
    ['f64', 'u64', noTruncateFloat],
    // convert to i32
    ['u8', 'i32', new IR.Nop()],
    ['u16', 'i32', new IR.Nop()],
    ['u32', 'i32', new IR.Nop()],
    ['u64', 'i32', noWrapBits],
    ['i8', 'i32', new IR.Nop()],
    ['i16', 'i32', new IR.Nop()],
    ['i32', 'i32', new IR.Nop()],
    ['i64', 'i32', noWrapBits],
    ['f32', 'i32', noTruncateFloat],
    ['f64', 'i32', noTruncateFloat],
    // convert to u32
    ['u8', 'u32', new IR.Nop()],
    ['u16', 'u32', new IR.Nop()],
    ['u32', 'u32', new IR.Nop()],
    ['u64', 'u32', noWrapBits],
    ['i8', 'u32', noDropSign],
    ['i16', 'u32', noDropSign],
    ['i32', 'u32', noDropSign],
    ['i64', 'u32', noWrapBits],
    ['f32', 'u32', noTruncateFloat],
    ['f64', 'u32', noTruncateFloat],
    // convert to i16
    ['u8', 'i16', new IR.Nop()],
    ['u16', 'i16', new IR.Nop()],
    ['u32', 'i16', noWrapBits],
    ['u64', 'i16', noWrapBits],
    ['i8', 'i16', new IR.Nop()],
    ['i16', 'i16', new IR.Nop()],
    ['i32', 'i16', noWrapBits],
    ['i64', 'i16', noWrapBits],
    ['f32', 'i16', noTruncateFloat],
    ['f64', 'i16', noTruncateFloat],
    // convert to u16
    ['u8', 'u16', new IR.Nop()],
    ['u16', 'u16', new IR.Nop()],
    ['u32', 'u16', noWrapBits],
    ['u64', 'u16', noWrapBits],
    ['i8', 'u16', noDropSign],
    ['i16', 'u16', noDropSign],
    ['i32', 'u16', noWrapBits],
    ['i64', 'u16', noWrapBits],
    ['f32', 'u16', noTruncateFloat],
    ['f64', 'u16', noTruncateFloat],
    // convert to i8
    ['u8', 'i8', new IR.Nop()],
    ['u16', 'i8', noWrapBits],
    ['u32', 'i8', noWrapBits],
    ['u64', 'i8', noWrapBits],
    ['i8', 'i8', new IR.Nop()],
    ['i16', 'i8', noWrapBits],
    ['i32', 'i8', noWrapBits],
    ['i64', 'i8', noWrapBits],
    ['f32', 'i8', noTruncateFloat],
    ['f64', 'i8', noTruncateFloat],
    // convert to u8
    ['u8', 'u8', new IR.Nop()],
    ['u16', 'u8', noWrapBits],
    ['u32', 'u8', noWrapBits],
    ['u64', 'u8', noWrapBits],
    ['i8', 'u8', noDropSign],
    ['i16', 'u8', noWrapBits],
    ['i32', 'u8', noWrapBits],
    ['i64', 'u8', noWrapBits],
    ['f32', 'u8', noTruncateFloat],
    ['f64', 'u8', noTruncateFloat],
  ];

  it.each(cases)('converts from %p to %p', (source, dest, instruction) => {
    const num = AST.makeNumberLiteral(1, 'int', source);
    let cast = AST.makeCastExpr(num, AST.makeTypeRef(dest), false);
    const compiler = irCompiler(cast);
    if (instruction instanceof Error) {
      expect(() => compiler.compile()).toThrowError(instruction);
    } else {
      const ir = compiler.compile();
      expect(ir).toEqual([...compiler.compileChild(num), instruction]);
    }
  });
});

function funcCompiler(func: AST.FuncDecl) {
  const refMap = resolveSymbols(func).refMap;
  const typeCache = resolveTypes(func, refMap);
  const moduleAllocator = resolveMemory(func, typeCache);
  return new FuncDeclCompiler(func, {
    refMap,
    typeCache,
    allocationMap: moduleAllocator.allocationMap,
    locals: moduleAllocator.getLocalsForFunc(func)!,
    runtime: { malloc: { area: 'funcs', offset: 1000000 } },
  });
}

describe('FuncDeclCompiler', () => {
  it('compiles functions', () => {
    const block = AST.makeBlock([AST.makeReturnStatement(makeNum(3))]);
    const compiler = funcCompiler(
      makeFunc(
        'foo',
        [
          AST.makeParameter('a', AST.makeTypeRef('i32')),
          AST.makeParameter('b', AST.makeTypeRef('f32')),
        ],
        block
      )
    );
    expect(compiler.compile()).toEqual(
      new Wasm.Func({
        id: 'foo',
        funcType: new Wasm.FuncTypeUse({
          params: [IR.NumberType.i32, IR.NumberType.f32],
          results: [IR.NumberType.i32],
        }),
        body: new BlockCompiler(block, {
          ...compiler.context,
        }).compile(),
      })
    );
  });

  it('allocates locals with offsets that come after parameters', () => {
    const block = AST.makeBlock([
      AST.makeLetStatement('foo', undefined, makeNum(3)),
      AST.makeLetStatement('bar', undefined, makeNum(5)),
    ]);
    const compiler = funcCompiler(
      makeFunc(
        'someFunc',
        [
          AST.makeParameter('a', AST.makeTypeRef('i32')),
          AST.makeParameter('b', AST.makeTypeRef('f32')),
        ],
        block
      )
    );
    expect(compiler.compile()).toEqual(
      new Wasm.Func({
        id: 'someFunc',
        funcType: new Wasm.FuncTypeUse({
          params: [IR.NumberType.i32, IR.NumberType.f32],
          results: [],
        }),
        locals: [
          new Wasm.Local(IR.NumberType.i32),
          new Wasm.Local(IR.NumberType.i32),
        ],
        body: [
          new IR.PushConst(IR.NumberType.i32, 3),
          new IR.LocalSet(2),
          new IR.PushConst(IR.NumberType.i32, 5),
          new IR.LocalSet(3),
        ],
      })
    );
  });

  it('reuses locals when it is safe', () => {
    const block = AST.makeBlock([
      AST.makeLetStatement('var1', undefined, makeNum(1)),
      AST.makeLetStatement('var2', undefined, makeNum(2)),
      AST.makeBlock([
        AST.makeLetStatement('var3', undefined, makeNum(3)),
        AST.makeLetStatement('var4', undefined, makeNum(4)),
      ]),
      AST.makeLetStatement('var5', undefined, makeNum(5)),
    ]);
    const compiler = funcCompiler(
      makeFunc(
        'foo',
        [
          AST.makeParameter('a', AST.makeTypeRef('i32')),
          AST.makeParameter('b', AST.makeTypeRef('f32')),
        ],
        block
      )
    );
    expect(compiler.compile()).toEqual(
      new Wasm.Func({
        id: 'foo',
        funcType: new Wasm.FuncTypeUse({
          params: [IR.NumberType.i32, IR.NumberType.f32],
          results: [],
        }),
        locals: [
          new Wasm.Local(IR.NumberType.i32),
          new Wasm.Local(IR.NumberType.i32),
          new Wasm.Local(IR.NumberType.i32),
          new Wasm.Local(IR.NumberType.i32),
        ],
        body: [
          new IR.PushConst(IR.NumberType.i32, 1),
          new IR.LocalSet(2),
          new IR.PushConst(IR.NumberType.i32, 2),
          new IR.LocalSet(3),
          new IR.PushConst(IR.NumberType.i32, 3),
          new IR.LocalSet(4),
          new IR.PushConst(IR.NumberType.i32, 4),
          new IR.LocalSet(5),
          // reuses local 4
          new IR.PushConst(IR.NumberType.i32, 5),
          new IR.LocalSet(4),
        ],
      })
    );
  });
});

describe('IfStatementCompiler', () => {
  it('compiles if statements', () => {
    const ifStatement = AST.makeIfStatement(
      AST.makeBooleanLiteral(true),
      AST.makeBlock([AST.makeExprStatement(makeNum(2))]),
      AST.makeBlock([AST.makeExprStatement(makeNum(4))])
    );
    const compiler = irCompiler(ifStatement);
    expect(compiler.compile()).toEqual([
      ...compiler.compileChild(ifStatement.fields.condExpr),
      new Wasm.IfBlock({
        then: compiler.compileChild(ifStatement.fields.thenBlock),
        else: compiler.compileChild(ifStatement.fields.elseBlock),
      }),
    ]);
  });
});

describe('WhileStatementCompiler', () => {
  it('compiles while statements', () => {
    const whileStatement = AST.makeWhileStatement(
      AST.makeBooleanLiteral(true),
      AST.makeBlock([AST.makeExprStatement(makeNum(2))])
    );
    const compiler = irCompiler(whileStatement);
    expect(compiler.compile()).toEqual([
      ...compiler.compileChild(whileStatement.fields.condExpr),
      new Wasm.IfBlock({
        then: [
          new Wasm.LoopBlock({
            instr: [
              ...compiler.compileChild(whileStatement.fields.thenBlock),
              ...compiler.compileChild(whileStatement.fields.condExpr),
              new IR.BreakIf('while_0'),
            ],
            label: 'while_0',
          }),
        ],
        else: [],
      }),
    ]);
  });
});

describe('ModuleCompiler', () => {
  it('compiles an empty module to an empty wasm module', () => {
    expect(
      new ModuleCompiler(AST.makeFile([], [], []), {
        includeRuntime: false,
      }).compile()
    ).toEqual(
      new Wasm.Module({
        funcs: [],
        globals: [],
      })
    );
  });
  it('compiles globals in the module', () => {
    expect(
      new ModuleCompiler(
        AST.makeFile(
          [],
          [AST.makeGlobalDecl('foo', undefined, makeNum(0))],
          []
        ),
        { includeRuntime: false }
      ).compile()
    ).toEqual(
      new Wasm.Module({
        globals: [
          new Wasm.Global({
            id: 'g0',
            globalType: new Wasm.GlobalType({
              valtype: IR.NumberType.i32,
              mut: true,
            }),
            expr: [new IR.PushConst(IR.NumberType.i32, 0)],
          }),
        ],
      })
    );
  });

  it('compiles functions in the module', () => {
    const num = AST.makeExprStatement(makeNum(32));
    const file = AST.makeFile([makeFunc('main', [], [num])], [], []);
    const compiler = new ModuleCompiler(file, { includeRuntime: false });
    expect(compiler.compile()).toEqual(
      new Wasm.Module({
        funcs: [
          new Wasm.Func({
            funcType: new Wasm.FuncTypeUse({
              params: [],
              results: [],
            }),
            exportName: '_start',
            id: 'main',
            body: irCompiler(num).compile(),
          }),
        ],
      })
    );
  });

  it('compiles string literals into data segments', () => {
    const compiler = new ModuleCompiler(
      AST.makeFile(
        [
          makeFunc(
            'main',
            [],
            [AST.makeExprStatement(AST.makeDataLiteral('hello world!'))]
          ),
        ],
        [],
        []
      ),
      { includeRuntime: false }
    );
    expect(compiler.compile()).toEqual(
      new Wasm.Module({
        datas: [new Wasm.Data({ datastring: 'hello world!', offset: 0 })],
        funcs: [
          new Wasm.Func({
            funcType: new Wasm.FuncTypeUse({
              params: [],
              results: [],
            }),
            exportName: '_start',
            id: 'main',
            body: [new IR.PushConst(IR.NumberType.i32, 0), new IR.Drop()],
          }),
        ],
      })
    );
  });

  it('compiles functions in the top-level block to wasm functions', () => {
    const funcDecl = makeFunc(
      'foo',
      [AST.makeParameter('a', AST.makeTypeRef('i32'))],
      [AST.makeReturnStatement(AST.makeSymbolRef('a'))]
    );
    const file = AST.makeFileWith({
      funcs: [funcDecl, makeFunc('main')],
      globals: [],
      decls: [],
    });
    const compiler = new ModuleCompiler(file, { includeRuntime: false });
    expect(compiler.compile()).toEqual(
      new Wasm.Module({
        funcs: [
          new FuncDeclCompiler(funcDecl, {
            refMap: compiler.refMap!,
            typeCache: compiler.typeCache!,
            allocationMap: compiler.moduleAllocator!.allocationMap,
            locals: compiler.moduleAllocator?.getLocalsForFunc(funcDecl)!,
            runtime: { malloc: { area: 'funcs', offset: 10000 } },
          }).compile(),
          new Wasm.Func({
            funcType: new Wasm.FuncTypeUse({
              params: [],
              results: [],
            }),
            id: 'main',
            exportName: '_start',
          }),
        ],
      })
    );
  });

  it('compiles extern declarations into wasm imports', () => {
    const file = AST.makeFileWith({
      funcs: [],
      globals: [],
      decls: [
        AST.makeExternDeclWith({
          libName: 'wasi_unstable',
          funcs: [
            AST.makeFuncDeclWith({
              symbol: 'fd_write',
              parameters: AST.makeParameterList([
                AST.makeParameter('fileDescriptor', AST.makeTypeRef('i32')),
                AST.makeParameter('iovPointer', AST.makeTypeRef('i32')),
                AST.makeParameter('iovLength', AST.makeTypeRef('i32')),
                AST.makeParameter('numWrittenPointer', AST.makeTypeRef('i32')),
              ]),
              returnType: AST.makeTypeRef('i32'),
              body: AST.makeBlock([]),
            }),
          ],
        }),
      ],
    });

    const compiler = new ModuleCompiler(file, { includeRuntime: false });
    const { i32 } = IR.NumberType;
    expect(compiler.compile()).toEqual(
      new Wasm.Module({
        imports: [
          new Wasm.Import({
            mod: 'wasi_unstable',
            nm: 'fd_write',
            importdesc: {
              kind: 'func',
              id: 'wasi_unstable_fd_write',
              typeuse: {
                params: [i32, i32, i32, i32],
                results: [i32],
              },
            },
          }),
        ],
      })
    );
  });
});
