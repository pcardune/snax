import * as AST from '../spec-gen.js';
import * as IR from '../stack-ir.js';
import * as Wasm from '../wasm-ast.js';
import { FuncDeclCompiler, BlockCompiler } from '../ast-compiler.js';
import { makeFunc, makeNum } from '../ast-util.js';
import {
  irCompiler,
  makeCompileToWAT,
  runtimeStub,
  WabtModule,
} from './test-util';
import { BinOp } from '../snax-ast.js';
import { resolveSymbols } from '../symbol-resolution.js';
import { resolveTypes } from '../type-resolution.js';
import { resolveMemory } from '../memory-resolution.js';
import loadWabt from 'wabt';

let wabt: WabtModule;
let compileToWAT: ReturnType<typeof makeCompileToWAT>;
beforeAll(async () => {
  wabt = await loadWabt();
  compileToWAT = makeCompileToWAT(wabt);
});

type WATable = { toWAT(): string };
function toWAT(els: WATable | WATable[]) {
  if (els instanceof Array) {
    return els.map((el) => el.toWAT()).join('\n');
  }
  return els.toWAT();
}

describe('BinaryExprCompiler', () => {
  const { i32, f32 } = IR.NumberType;
  test('compile() combines the stack IRS of the sub expressions', () => {
    const twenty = makeNum(20);
    const thirty = makeNum(30);
    const expr = AST.makeBinaryExpr(BinOp.ADD, twenty, thirty);
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
      AST.makeBinaryExpr(BinOp.ADD, ten, twelvePointThree)
    );
    expect(compiler.compile()).toEqual([
      ...compiler.compileChild(ten),
      new IR.Convert(i32, f32),
      ...compiler.compileChild(twelvePointThree),
      new IR.Add(f32),
    ]);
    compiler = irCompiler(AST.makeBinaryExpr(BinOp.ADD, twelvePointThree, ten));
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

function funcCompiler(func: AST.FuncDecl) {
  const refMap = resolveSymbols(func).refMap;
  const typeCache = resolveTypes(func, refMap);
  const moduleAllocator = resolveMemory(func, typeCache);
  const funcLocals = moduleAllocator.getLocalsForFunc(func);
  return new FuncDeclCompiler(func, {
    refMap,
    typeCache,
    allocationMap: moduleAllocator.allocationMap,
    funcAllocs: funcLocals,
    runtime: runtimeStub,
  });
}

describe('FuncDeclCompiler', () => {
  let func: Wasm.Func;
  let compiler: FuncDeclCompiler;
  let block: AST.Block;
  beforeAll(() => {
    block = AST.makeBlock([AST.makeReturnStatement(makeNum(3))]);
    compiler = funcCompiler(
      makeFunc(
        'foo',
        [
          AST.makeParameter('a', AST.makeTypeRef('i32')),
          AST.makeParameter('b', AST.makeTypeRef('f32')),
        ],
        block
      )
    );
    func = compiler.compile();
  });
  it('attaches an id to the function', () => {
    expect(func.fields.id).toEqual('f0:foo');
  });
  it('specifies the correct function typeuse', () => {
    expect(toWAT(func.fields.funcType)).toMatchInlineSnapshot(
      `"(param $p0:a i32) (param $p1:b f32) (result i32)"`
    );
  });
  it('has a preamble that stores the stack pointer into the arp', () => {
    expect(toWAT(compiler.preamble())).toMatchInlineSnapshot(`
      "global.get $g1000:#SP
      local.set $arp"
    `);
  });
  it('compiles functions', () => {
    expect(toWAT(func.fields.body)).toEqual(
      toWAT([
        ...compiler.preamble(),
        ...new BlockCompiler(block, {
          ...compiler.context,
        }).compile(),
      ])
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
    const func = compiler.compile();
    expect(func.fields.locals.map((l) => l.fields.id)).toMatchInlineSnapshot(`
      Array [
        "arp",
      ]
    `);
    expect(func.fields.body.map((i) => i.toWAT()).join('\n'))
      .toMatchInlineSnapshot(`
      "global.get $g1000:#SP
      i32.const 8
      i32.sub
      global.set $g1000:#SP
      global.get $g1000:#SP
      local.set $arp
      local.get $arp
      i32.const 3
      i32.store offset=0 align=4
      local.get $arp
      i32.const 5
      i32.store offset=4 align=4"
    `);
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
    const func = compiler.compile();
    expect(
      func.fields.locals.map((i) => i.toWAT()).join('\n')
    ).toMatchInlineSnapshot(`"(local $arp i32)"`);
    expect(func.fields.body.map((i) => i.toWAT()).join('\n'))
      .toMatchInlineSnapshot(`
      "global.get $g1000:#SP
      i32.const 20
      i32.sub
      global.set $g1000:#SP
      global.get $g1000:#SP
      local.set $arp
      local.get $arp
      i32.const 1
      i32.store offset=0 align=4
      local.get $arp
      i32.const 2
      i32.store offset=4 align=4
      local.get $arp
      i32.const 3
      i32.store offset=8 align=4
      local.get $arp
      i32.const 4
      i32.store offset=12 align=4
      local.get $arp
      i32.const 5
      i32.store offset=16 align=4"
    `);
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
    const { wat } = compileToWAT(AST.makeFile([], [], []), {
      includeRuntime: false,
    });
    expect(wabt.parseWat('', wat).toText({})).toMatchInlineSnapshot(`
"(module
  (memory (;0;) 1)
  (global $g0:#SP (mut i32) (i32.const 0))
  (export \\"memory\\" (memory 0))
  (export \\"stackPointer\\" (global 0)))
"
`);
  });
  it('compiles globals in the module', () => {
    const { wat } = compileToWAT(
      AST.makeFile([], [AST.makeGlobalDecl('foo', undefined, makeNum(0))], []),
      { includeRuntime: false }
    );
    expect(wat).toMatchInlineSnapshot(`
"(module
  (memory (;0;) 1)
  (global $g0:foo (mut i32) (i32.const 0))
  (global $g1:#SP (mut i32) (i32.const 0))
  (export \\"memory\\" (memory 0))
  (export \\"stackPointer\\" (global 1)))
"
`);
  });
  it('compiles functions in the module', () => {
    const num = AST.makeExprStatement(makeNum(32));
    const file = AST.makeFile([makeFunc('main', [], [num])], [], []);
    const { wat } = compileToWAT(file, { includeRuntime: false });
    expect(wat).toMatchInlineSnapshot(`
"(module
  (memory (;0;) 1)
  (global $g0:#SP (mut i32) (i32.const 0))
  (func $f0:main
    (local $arp i32)
    (local.set $arp
      (global.get $g0:#SP))
    (drop
      (i32.const 32)))
  (func (;1;)
    (global.set $g0:#SP
      (i32.const 65536))
    (call $f0:main))
  (export \\"_start\\" (func 1))
  (export \\"memory\\" (memory 0))
  (export \\"stackPointer\\" (global 0))
  (type (;0;) (func)))
"
`);
  });

  it('compiles string literals into data segments', () => {
    const { wat } = compileToWAT(
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
    expect(wat).toMatchInlineSnapshot(`
"(module
  (memory (;0;) 1)
  (data $d0 (i32.const 0) \\"hello world!\\")
  (global $g0:#SP (mut i32) (i32.const 0))
  (func $f0:main
    (local $arp i32)
    (local.set $arp
      (global.get $g0:#SP))
    (drop
      (i32.const 0)))
  (func (;1;)
    (global.set $g0:#SP
      (i32.const 65536))
    (call $f0:main))
  (export \\"_start\\" (func 1))
  (export \\"memory\\" (memory 0))
  (export \\"stackPointer\\" (global 0))
  (type (;0;) (func)))
"
`);
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
    const { wat } = compileToWAT(file, { includeRuntime: false });
    expect(wat).toMatchInlineSnapshot(`
"(module
  (memory (;0;) 1)
  (global $g0:#SP (mut i32) (i32.const 0))
  (func $f0:foo (param $p0:a i32) (result i32)
    (local $arp i32)
    (local.set $arp
      (global.get $g0:#SP))
    (return
      (local.get $p0:a)))
  (func $f1:main
    (local $arp i32)
    (local.set $arp
      (global.get $g0:#SP)))
  (func (;2;)
    (global.set $g0:#SP
      (i32.const 65536))
    (call $f1:main))
  (export \\"_start\\" (func 2))
  (export \\"memory\\" (memory 0))
  (export \\"stackPointer\\" (global 0))
  (type (;0;) (func (param i32) (result i32)))
  (type (;1;) (func)))
"
`);
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

    const { wat } = compileToWAT(file, { includeRuntime: false });
    expect(wat).toMatchInlineSnapshot(`
"(module
  (import \\"wasi_unstable\\" \\"fd_write\\" (func $f0:fd_write (param i32 i32 i32 i32) (result i32)))
  (memory (;0;) 1)
  (global $g0:#SP (mut i32) (i32.const 0))
  (export \\"memory\\" (memory 0))
  (export \\"stackPointer\\" (global 0))
  (type (;0;) (func (param i32 i32 i32 i32) (result i32))))
"
`);
  });
});
