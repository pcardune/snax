import { SNAXParser } from '../snax-parser';
import { compileInstructions } from '../wat-compiler';
import loadWabt from 'wabt';

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;

let wabt: ThenArg<ReturnType<typeof loadWabt>>;
beforeAll(async () => {
  wabt = await loadWabt();
});

describe('end-to-end test', () => {
  const ast = SNAXParser.parseStrOrThrow('3+5*2-10/10');
  const wat = compileInstructions(ast.toStackIR());
  test('it parses', async () => {
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
});
