import { SNAXParser } from '../snax-parser';
import * as AST from '../snax-ast';
import { compileAST } from '../wat-compiler';
import loadWabt from 'wabt';

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;

let wabt: ThenArg<ReturnType<typeof loadWabt>>;
beforeAll(async () => {
  wabt = await loadWabt();
});

function compileToWAT(input: string) {
  const ast = SNAXParser.parseStrOrThrow(input);

  if (!(ast instanceof AST.Block)) {
    throw new Error(`parsed to an ast node ${ast}, which isn't a block`);
  }
  return compileAST(ast);
}

async function compileToWasmModule(input: string) {
  const wat = compileToWAT(input);
  const wasmModule = wabt.parseWat('', wat);
  wasmModule.validate();
  const result = wasmModule.toBinary({ write_debug_names: true });
  const module = await WebAssembly.instantiate(result.buffer);
  const exports = module.instance.exports;
  return { exports: exports as any, wasmModule };
}

async function exec(input: string) {
  const { exports } = await compileToWasmModule(input);
  return exports.main();
}

describe('end-to-end test', () => {
  it('compiles integers', async () => {
    const { exports } = await compileToWasmModule('123;');
    expect(exports.main()).toEqual(123);
  });

  it('compiles floats', async () => {
    const { exports } = await compileToWasmModule('1.23;');
    expect(exports.main()).toBeCloseTo(1.23, 4);
  });

  it('compiles booleans', async () => {
    expect(await exec('true;')).toBe(1);
    expect(await exec('false;')).toBe(0);
  });

  it('compiles arrays', async () => {
    const input = '[6,5,4][1];';
    const { exports } = await compileToWasmModule(input);
    const result = exports.main();
    const mem = new Int8Array(exports.mem.buffer.slice(0, 12));
    expect([...mem]).toEqual([6, 0, 0, 0, 5, 0, 0, 0, 4, 0, 0, 0]);
    expect(result).toBe(5);
  });

  it('compiles boolean expressions', async () => {
    expect(await exec('true && false;')).toBe(0);
    expect(await exec('true || false;')).toBe(1);
    expect(await exec('true && true;')).toBe(1);
    expect(await exec('false || false;')).toBe(0);
  });

  it('compiles expressions', async () => {
    const { exports, wasmModule } = await compileToWasmModule('3+5*2-10/10;');
    expect(wasmModule.toText({})).toMatchInlineSnapshot(`
      "(module
        (memory (;0;) 1)
        (export \\"mem\\" (memory 0))
        (func (;0;) (result i32)
          i32.const 1
          memory.grow
          drop
          i32.const 3
          i32.const 5
          i32.const 2
          i32.mul
          i32.add
          i32.const 10
          i32.const 10
          i32.div_s
          i32.sub)
        (export \\"main\\" (func 0))
        (type (;0;) (func (result i32))))
      "
    `);
    expect(exports.main()).toEqual(12);
  });

  it('converts between ints and floats', async () => {
    const { exports, wasmModule } = await compileToWasmModule('3+5.2;');
    expect(exports.main()).toBeCloseTo(8.2);
  });

  describe('block compilation', () => {
    it('compiles blocks', async () => {
      const { exports, wasmModule } = await compileToWasmModule(
        'let x = 3; let y = x+4; y;'
      );
      expect(wasmModule.toText({})).toMatchInlineSnapshot(`
              "(module
                (memory (;0;) 1)
                (export \\"mem\\" (memory 0))
                (func (;0;) (result i32)
                  (local i32 i32)
                  i32.const 1
                  memory.grow
                  drop
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
      expect(exports.main()).toBe(7);
    });

    describe('nested blocks have their own lexical scope', () => {
      it('assigns to a separate location for a symbol of the same name', async () => {
        expect(
          await exec(`
            let x = 1;
            {
              let x = 2;
            }
            x;
          `)
        ).toEqual(1);
      });
      it('assigns to a separate location for a symbol of the same name declared after the nested block', async () => {
        expect(
          await exec(`
            {
              let y = 2;
            }
            let y = 3;
            y;
          `)
        ).toEqual(3);
      });
      it('assigns to the right location for a variable declared in a higher scope', async () => {
        expect(
          await exec(`
            let x = 1;
            {
              x = 2;
            }
            x;
          `)
        ).toEqual(2);
      });
      it('fails if you try to assign to something that has not yet been declared', async () => {
        await expect(
          exec(`
            let x = 1;
            {
              y = 2;
            }
            let y = 3;
            y;
          `)
        ).rejects.toMatchInlineSnapshot(
          `[Error: Reference to undeclared symbol y]`
        );
      });
    });
  });

  describe('assignment operator', () => {
    it('compiles assignments', async () => {
      expect(await exec('let x = 3; x = 4; x;')).toBe(4);
    });
    it('does not compile invalid assignments', async () => {
      await expect(exec('let x = 3; y = 4; y;')).rejects.toMatchInlineSnapshot(
        `[Error: Reference to undeclared symbol y]`
      );
      await expect(exec('let x = 3; 5 = 4; x;')).rejects.toMatchInlineSnapshot(
        `[Error: Can't assign to something that is not a resolved symbol]`
      );
    });
  });
});
