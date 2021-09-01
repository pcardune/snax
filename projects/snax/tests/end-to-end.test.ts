import { SNAXParser } from '../snax-parser';
import * as AST from '../snax-ast';
import loadWabt from 'wabt';
import { ModuleCompiler, ModuleCompilerOptions } from '../ast-compiler';

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;

let wabt: ThenArg<ReturnType<typeof loadWabt>>;
beforeAll(async () => {
  wabt = await loadWabt();
});

function compileToWAT(input: string, options?: ModuleCompilerOptions) {
  const ast = SNAXParser.parseStrOrThrow(input);

  if (!(ast instanceof AST.File)) {
    throw new Error(`parsed to an ast node ${ast}, which isn't a file`);
  }
  const wat = new ModuleCompiler(ast, options).compile().toWAT();
  try {
    return wabt.parseWat('', wat).toText({});
  } catch (e) {
    return wat;
  }
}

async function compileToWasmModule(
  input: string,
  options?: ModuleCompilerOptions
) {
  const wat = compileToWAT(input, options);
  const wasmModule = wabt.parseWat('', wat);
  wasmModule.validate();
  const result = wasmModule.toBinary({ write_debug_names: true });
  const module = await WebAssembly.instantiate(result.buffer);
  const exports = module.instance.exports;
  return { exports: exports as any, wasmModule };
}

async function exec(input: string) {
  const { exports } = await compileToWasmModule(input, {
    includeRuntime: true,
  });
  return exports.main();
}

describe('end-to-end test', () => {
  it('compiles an empty program', async () => {
    expect(compileToWAT('')).toMatchInlineSnapshot(`
      "(module
        (memory (;0;) 1)
        (export \\"mem\\" (memory 0))
        (func $main)
        (export \\"main\\" (func 0))
        (type (;0;) (func)))
      "
    `);
    expect(await exec('')).toBe(undefined);
  });

  it('compiles integers', async () => {
    expect(compileToWAT('123;')).toMatchInlineSnapshot(`
      "(module
        (memory (;0;) 1)
        (export \\"mem\\" (memory 0))
        (func $main (result i32)
          i32.const 123
          return)
        (export \\"main\\" (func 0))
        (type (;0;) (func (result i32))))
      "
    `);
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

  it('compiles boolean expressions', async () => {
    expect(await exec('true && false;')).toBe(0);
    expect(await exec('true || false;')).toBe(1);
    expect(await exec('true && true;')).toBe(1);
    expect(await exec('false || false;')).toBe(0);
  });

  it('compiles relational operators', async () => {
    expect(await exec('3 < 5;')).toBe(1);
    expect(await exec('10 < 5;')).toBe(0);
    expect(await exec('3 > 5;')).toBe(0);
    expect(await exec('10 > 5;')).toBe(1);
    expect(await exec('3 == 5;')).toBe(0);
    expect(await exec('5 == 5;')).toBe(1);
    expect(await exec('3 != 5;')).toBe(1);
    expect(await exec('5 != 5;')).toBe(0);
    expect(await exec('true == false;')).toBe(0);
    expect(await exec('false == false;')).toBe(1);
  });

  it('compiles expressions', async () => {
    const { exports, wasmModule } = await compileToWasmModule('3+5*2-10/10;');
    expect(wasmModule.toText({})).toMatchInlineSnapshot(`
      "(module
        (memory (;0;) 1)
        (export \\"mem\\" (memory 0))
        (func $main (result i32)
          i32.const 3
          i32.const 5
          i32.const 2
          i32.mul
          i32.add
          i32.const 10
          i32.const 10
          i32.div_s
          i32.sub
          return)
        (export \\"main\\" (func 0))
        (type (;0;) (func (result i32))))
      "
    `);
    expect(exports.main()).toEqual(12);
  });

  it('converts between ints and floats', async () => {
    expect(compileToWAT('3+5.2;')).toMatchInlineSnapshot(`
      "(module
        (memory (;0;) 1)
        (export \\"mem\\" (memory 0))
        (func $main (result f32)
          i32.const 3
          f32.convert_i32_s
          f32.const 0x1.4cccccp+2 (;=5.2;)
          f32.add
          return)
        (export \\"main\\" (func 0))
        (type (;0;) (func (result f32))))
      "
    `);
    const { exports, wasmModule } = await compileToWasmModule('3+5.2;');
    expect(exports.main()).toBeCloseTo(8.2);
  });
});

describe('block compilation', () => {
  it('compiles blocks', async () => {
    expect(compileToWAT('let x = 3; let y = x+4; y;')).toMatchInlineSnapshot(`
        "(module
          (memory (;0;) 1)
          (export \\"mem\\" (memory 0))
          (func $main (result i32)
            (local i32 i32)
            i32.const 3
            local.set 0
            local.get 0
            i32.const 4
            i32.add
            local.set 1
            local.get 1
            return)
          (export \\"main\\" (func 0))
          (type (;0;) (func (result i32))))
        "
      `);
    const { exports, wasmModule } = await compileToWasmModule(
      'let x = 3; let y = x+4; y;'
    );
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
      const code = `
          let x = 1;
          {
            x = 2;
          }
          x;
        `;
      expect(compileToWAT(code)).toMatchInlineSnapshot(`
          "(module
            (memory (;0;) 1)
            (export \\"mem\\" (memory 0))
            (func $main (result i32)
              (local i32)
              i32.const 1
              local.set 0
              i32.const 2
              local.tee 0
              drop
              local.get 0
              return)
            (export \\"main\\" (func 0))
            (type (;0;) (func (result i32))))
          "
        `);
      expect(await exec(code)).toEqual(2);
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

describe('control flow', () => {
  it('compiles if statements', async () => {
    const code = `
        let x=3;
        if (x==4) {
          x=7;
        } else {
          x=9;
        }
        x;
      `;
    expect(await exec(code)).toBe(9);
  });
  it('compiles while statements', async () => {
    const code = `
        let i = 0;
        while (i < 10) {
          i = i+1;
        }
        i;
      `;
    expect(await exec(code)).toBe(10);
  });
});

describe('functions', () => {
  it('compiles functions', async () => {
    const wat = compileToWAT(`
          let x = 3;
          add(x, 5);
          func add(x:i32, y:i32) {
            return x+y;
          }
        `);
    expect(wat).toMatchInlineSnapshot(`
        "(module
          (memory (;0;) 1)
          (export \\"mem\\" (memory 0))
          (func $add (param i32 i32) (result i32)
            (local i32 i32)
            local.get 0
            local.get 1
            i32.add
            return)
          (func $main (result i32)
            (local i32)
            i32.const 3
            local.set 0
            local.get 0
            i32.const 5
            call 0
            return)
          (export \\"main\\" (func 1))
          (type (;0;) (func (param i32 i32) (result i32)))
          (type (;1;) (func (result i32))))
        "
      `);
    expect(
      await exec(`
          let x = 3;
          add(x, 5);
          func add(x:i32, y:i32) {
            return x+y;
          }
        `)
    ).toBe(8);
  });
});

describe('globals', () => {
  it('supports globals', async () => {
    const code = `
        global counter = 0;
        func count() {
          counter = counter + 1;
        }
        count();
        count();
        counter;
      `;
    expect(compileToWAT(code)).toMatchInlineSnapshot(`
        "(module
          (memory (;0;) 1)
          (export \\"mem\\" (memory 0))
          (global $g0 (mut i32) (i32.const 0))
          (func $count
            global.get 0
            i32.const 1
            i32.add
            global.set 0
            global.get 0
            drop)
          (func $main (result i32)
            call 0
            call 0
            global.get 0
            return)
          (export \\"main\\" (func 1))
          (type (;0;) (func))
          (type (;1;) (func (result i32))))
        "
      `);
    expect(await exec(code)).toEqual(2);
  });
});

describe('runtime', () => {
  it('has malloc', async () => {
    expect(
      await exec(`
          let x = malloc(3);
          let y = malloc(4);
          y;
        `)
    ).toEqual(3);
  });
});

describe('arrays', () => {
  it('compiles arrays', async () => {
    const input = '[6,5,4][1];';
    const { exports } = await compileToWasmModule(input);
    const result = exports.main();
    const mem = new Int8Array(exports.mem.buffer.slice(0, 12));
    expect([...mem]).toEqual([6, 0, 0, 0, 5, 0, 0, 0, 4, 0, 0, 0]);
    expect(result).toBe(5);
  });
});
