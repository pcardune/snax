import * as AST from '../spec-gen.js';
import { makeFunc, makeNum } from '../ast-util.js';
import { compileToWAT } from './test-util';

describe('ModuleCompiler', () => {
  it('compiles an empty module to an empty wasm module', async () => {
    const { wat } = await compileToWAT(AST.makeFileWith({ decls: [] }), {
      includeRuntime: false,
    });
    expect(wat).toMatchInlineSnapshot(`
      "(module
       (global $g0:#SP (mut i32) (i32.const 0))
       (memory $0 1 1)
       (export \\"stackPointer\\" (global $g0:#SP))
       (export \\"memory\\" (memory $0))
      )
      "
    `);
  });
  it('compiles globals in the module', async () => {
    const { wat } = await compileToWAT(
      AST.makeFileWith({
        decls: [AST.makeGlobalDecl('foo', undefined, makeNum(0))],
      }),
      { includeRuntime: false }
    );
    expect(wat).toMatchInlineSnapshot(`
      "(module
       (global $g0:foo (mut i32) (i32.const 0))
       (global $g1:#SP (mut i32) (i32.const 0))
       (memory $0 1 1)
       (export \\"stackPointer\\" (global $g1:#SP))
       (export \\"memory\\" (memory $0))
      )
      "
    `);
  });
  it('compiles functions in the module', async () => {
    const num = AST.makeExprStatement(makeNum(32));
    const file = AST.makeFileWith({
      decls: [makeFunc('main', [], [num])],
    });
    const { wat } = await compileToWAT(file, { includeRuntime: false });
    expect(wat).toMatchInlineSnapshot(`
      "(module
       (type $none_=>_none (func))
       (global $g0:#SP (mut i32) (i32.const 0))
       (memory $0 1 1)
       (export \\"_start\\" (func $_start))
       (export \\"stackPointer\\" (global $g0:#SP))
       (export \\"memory\\" (memory $0))
       (func $<<root>::main>f0
        (local $0 i32)
        (local.set $0
         (global.get $g0:#SP)
        )
        (drop
         (i32.const 32)
        )
       )
       (func $_start
        (global.set $g0:#SP
         (i32.const 65536)
        )
        (return
         (call $<<root>::main>f0)
        )
       )
      )
      "
    `);
  });

  it('compiles string literals into data segments', async () => {
    const { wat } = await compileToWAT(
      AST.makeFileWith({
        decls: [
          makeFunc(
            'main',
            [],
            [AST.makeExprStatement(AST.makeDataLiteral('hello world!'))]
          ),
        ],
      }),
      { includeRuntime: false }
    );
    expect(wat).toMatchInlineSnapshot(`
      "(module
       (type $none_=>_none (func))
       (global $g0:#SP (mut i32) (i32.const 0))
       (memory $0 1 1)
       (data (i32.const 0) \\"hello world!\\")
       (export \\"_start\\" (func $_start))
       (export \\"stackPointer\\" (global $g0:#SP))
       (export \\"memory\\" (memory $0))
       (func $<<root>::main>f0
        (local $0 i32)
        (local.set $0
         (global.get $g0:#SP)
        )
        (drop
         (i32.const 0)
        )
       )
       (func $_start
        (global.set $g0:#SP
         (i32.const 65536)
        )
        (return
         (call $<<root>::main>f0)
        )
       )
      )
      "
    `);
  });

  it('compiles functions in the top-level block to wasm functions', async () => {
    const funcDecl = makeFunc(
      'foo',
      [AST.makeParameter('a', AST.makeTypeRef(AST.makeSymbolRef('i32')))],
      [AST.makeReturnStatement(AST.makeSymbolRef('a'))]
    );
    const file = AST.makeFileWith({
      decls: [funcDecl, makeFunc('main')],
    });
    const { wat } = await compileToWAT(file, { includeRuntime: false });
    expect(wat).toMatchInlineSnapshot(`
      "(module
       (type $none_=>_none (func))
       (type $i32_=>_i32 (func (param i32) (result i32)))
       (global $g0:#SP (mut i32) (i32.const 0))
       (memory $0 1 1)
       (export \\"_start\\" (func $_start))
       (export \\"stackPointer\\" (global $g0:#SP))
       (export \\"memory\\" (memory $0))
       (func $<<root>::foo>f0 (param $0 i32) (result i32)
        (local $1 i32)
        (local.set $1
         (global.get $g0:#SP)
        )
        (return
         (local.get $0)
        )
       )
       (func $<<root>::main>f1
        (local $0 i32)
        (local.set $0
         (global.get $g0:#SP)
        )
       )
       (func $_start
        (global.set $g0:#SP
         (i32.const 65536)
        )
        (return
         (call $<<root>::main>f1)
        )
       )
      )
      "
    `);
  });

  it('compiles extern declarations into wasm imports', async () => {
    const file = AST.makeFileWith({
      decls: [
        AST.makeExternDeclWith({
          libName: 'wasi_unstable',
          funcs: [
            AST.makeExternFuncDeclWith({
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
              returnType: AST.makeTypeRef(AST.makeSymbolRef('i32')),
            }),
          ],
        }),
      ],
    });

    const { wat } = await compileToWAT(file, { includeRuntime: false });
    expect(wat).toMatchInlineSnapshot(`
      "(module
       (type $i32_i32_i32_i32_=>_i32 (func (param i32 i32 i32 i32) (result i32)))
       (import \\"wasi_unstable\\" \\"fd_write\\" (func $<<root>::fd_write>f0 (param i32 i32 i32 i32) (result i32)))
       (global $g0:#SP (mut i32) (i32.const 0))
       (memory $0 1 1)
       (export \\"stackPointer\\" (global $g0:#SP))
       (export \\"memory\\" (memory $0))
      )
      "
    `);
  });
});
