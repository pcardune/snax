import { SNAXParser } from '../snax-parser';
import { compileInstructions } from '../wat-compiler';
import loadWabt from 'wabt';
import { Block, Expression } from '../snax-ast';

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;

let wabt: ThenArg<ReturnType<typeof loadWabt>>;
beforeAll(async () => {
  wabt = await loadWabt();
});

async function compileToWasmModule(input: string) {
  const ast = SNAXParser.parseStrOrThrow(input);
  if (!ast.hasStackIR()) {
    throw new Error(
      `parsed to an ast node ${ast}, which doesn't have toStackIR()`
    );
  }
  const wat = compileInstructions(ast.toStackIR());
  const wasmModule = wabt.parseWat('', wat);
  wasmModule.validate();
  const result = wasmModule.toBinary({ write_debug_names: true });
  const module = await WebAssembly.instantiate(result.buffer);
  const exports = module.instance.exports;
  return { exports: exports as any, wasmModule };
}

describe('end-to-end test', () => {
  test('it compiles integers', async () => {
    const { exports } = await compileToWasmModule('123');
    expect(exports.main()).toEqual(123);
  });

  test('it compiles expressions', async () => {
    const { exports, wasmModule } = await compileToWasmModule('3+5*2-10/10');
    expect(wasmModule.toText({})).toMatchInlineSnapshot(`
      "(module
        (func (;0;) (result i32)
          i32.const 3
          i32.const 5
          i32.const 2
          i32.mul
          i32.const 10
          i32.const 10
          i32.div_s
          i32.sub
          i32.add)
        (export \\"main\\" (func 0))
        (type (;0;) (func (result i32))))
      "
    `);
    expect(exports.main()).toEqual(12);
  });

  it('compiles blocks', async () => {
    const { exports, wasmModule } = await compileToWasmModule(
      'let x = 3; let y = x+4;'
    );
    expect(wasmModule.toText({})).toMatchInlineSnapshot(`
      "(module
        (func (;0;) (result i32)
          (local i32 i32)
          i32.const 3
          local.set 0
          local.get 0
          i32.const 4
          i32.add
          local.set 1
          local.get 1)
        (export \\"main\\" (func 0))
        (type (;0;) (func (result i32))))
      "
    `);
  });
});
