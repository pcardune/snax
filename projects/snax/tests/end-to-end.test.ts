import { SNAXParser } from '../snax-parser';
import { compileInstructions } from '../wat-compiler';
import loadWabt from 'wabt';
import { Block, Expression } from '../snax-ast';

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;

let wabt: ThenArg<ReturnType<typeof loadWabt>>;
beforeAll(async () => {
  wabt = await loadWabt();
});

describe('end-to-end test', () => {
  test('it compiles expressions', async () => {
    const ast = SNAXParser.parseStrOrThrow('3+5*2-10/10') as Expression;
    const wat = compileInstructions(ast.toStackIR());
    const wasmModule = wabt.parseWat('', wat);
    wasmModule.validate();
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
    const result = wasmModule.toBinary({ write_debug_names: true });
    const module = await WebAssembly.instantiate(result.buffer);
    const returnValue = (module.instance.exports as any).main();
    expect(returnValue).toEqual(12);
  });

  it('compiles blocks', async () => {
    const ast = SNAXParser.parseStrOrThrow('let x = 3; let y = x+4;') as Block;
    expect(ast).toBeInstanceOf(Block);
    const ir = ast.toStackIR();
    const wat = compileInstructions(ir);
    const wasmModule = wabt.parseWat('', wat);
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
    wasmModule.validate();
  });
});
