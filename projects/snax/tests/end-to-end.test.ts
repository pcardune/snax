import { SNAXParser } from '../snax-parser';
import loadWabt from 'wabt';
import { ModuleCompiler, ModuleCompilerOptions } from '../ast-compiler';
import { isFile } from '../spec-gen';

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;

let wabt: ThenArg<ReturnType<typeof loadWabt>>;
beforeAll(async () => {
  wabt = await loadWabt();
});

function compileToWAT(input: string, options?: ModuleCompilerOptions) {
  const ast = SNAXParser.parseStrOrThrow(input);

  if (!isFile(ast)) {
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
  return exports._start();
}

describe('end-to-end test', () => {
  it('compiles an empty program', async () => {
    expect(compileToWAT('', { includeRuntime: true })).toMatchInlineSnapshot(`
      "(module
        (memory (;0;) 1)
        (export \\"memory\\" (memory 0))
        (global $g0 (mut i32) (i32.const 0))
        (func $main)
        (export \\"_start\\" (func 0))
        (func $malloc (param i32) (result i32)
          (local i32)
          global.get 0
          local.set 1
          global.get 0
          local.get 0
          i32.add
          global.set 0
          global.get 0
          drop
          local.get 1
          return)
        (type (;0;) (func))
        (type (;1;) (func (param i32) (result i32))))
      "
    `);
    expect(await exec('')).toBe(undefined);
  });

  it('compiles integers', async () => {
    const { exports } = await compileToWasmModule('123;');
    expect(exports._start()).toEqual(123);
  });

  it('compiles floats', async () => {
    const { exports } = await compileToWasmModule('1.23;');
    expect(exports._start()).toBeCloseTo(1.23, 4);
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
    expect(exports._start()).toEqual(12);
  });

  it('converts between ints and floats', async () => {
    // const { exports, wasmModule } = await compileToWasmModule('3+5.2;');
    // expect(exports._start()).toBeCloseTo(8.2);
  });
});

describe('block compilation', () => {
  it('compiles blocks', async () => {
    const { exports, wasmModule } = await compileToWasmModule(
      'let x = 3; let y = x+4; y;'
    );
    expect(exports._start()).toBe(7);
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
      `[Error: ASSIGN: Can't assign to something that is not a resolved symbol or a memory address]`
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

describe('pointers', () => {
  it('has pointers', async () => {
    const code = `
        let p:&i32 = 0;
        @p = 10;
        @p;
      `;
    expect(await exec(code)).toEqual(10);
  });
  it('allows pointer arithmetic through array indexing', async () => {
    const code = `
      let p:&i32 = 0;
      let q:&i32 = 4;
      @q = 175;
      p[1];
    `;
    const { exports } = await compileToWasmModule(code);
    expect(exports._start()).toEqual(175);
    const mem = new Int32Array(exports.memory.buffer.slice(0, 8));
    expect([...mem]).toEqual([0, 175]);
  });
  it('allows assigning to pointer offsets with array indexing', async () => {
    const code = `
      let p:&i32 = 0;
      p[1] = 174;
    `;
    const { exports } = await compileToWasmModule(code);
    expect(exports._start()).toEqual(174);
    const mem = new Int32Array(exports.memory.buffer.slice(0, 8));
    expect([...mem]).toEqual([0, 174]);
  });
  it('respects the size of the type being pointed to', async () => {
    const code = `
      let p:&i16 = 0;
      p[0] = 12_i16;
      p[1] = 13_i16;
      p[0] = 10_i16;
    `;
    const { exports } = await compileToWasmModule(code);
    expect(exports._start()).toEqual(10);
    const mem = new Int16Array(exports.memory.buffer.slice(0, 4));
    expect([...mem]).toEqual([10, 13]);
  });
  it('calculates the indexing expression only once.', async () => {
    const code = `
      let p:&i32 = 0;
      p[0] = 0;
      p[2] = 5;
      p[p[0]] = 2;
    `;
    const { exports } = await compileToWasmModule(code);
    expect(exports._start()).toEqual(2);
    const mem = new Int32Array(exports.memory.buffer.slice(0, 12));
    expect([...mem]).toEqual([2, 0, 5]);
  });
  it('calculates the value expression only once.', async () => {
    const code = `
      let p:&i32 = 0;
      p[0] = 0;
      p[2] = 5;
      p[0] = p[0]+2;
    `;
    const { exports } = await compileToWasmModule(code);
    expect(exports._start()).toEqual(2);
    const mem = new Int32Array(exports.memory.buffer.slice(0, 12));
    expect([...mem]).toEqual([2, 0, 5]);
  });
  it('allows moving pointers around', async () => {
    const code = `
      let p:&u8 = 0;
      p[0] = 1_u8;
      p[1] = 2_u8;
      let q:&u8 = p;
      q[1] = 3_u8;
    `;
    const { exports } = await compileToWasmModule(code);
    expect(exports._start()).toEqual(3);
    const mem = new Int8Array(exports.memory.buffer.slice(0, 2));
    expect([...mem]).toEqual([1, 3]);
  });
  it('allows casting a pointer to an i32', async () => {
    const code = `
      let p:&u8 = 100;
      let j:i32 = p as i32;
      j;
    `;
    expect(await exec(code)).toEqual(100);
  });
});

describe('arrays', () => {
  it('compiles arrays', async () => {
    const input = 'let a = "data"; [6,5,4][1];';
    const { exports } = await compileToWasmModule(input);
    const result = exports._start();
    expect(result).toBe(5);
    const mem = new Int8Array(exports.memory.buffer.slice(0, 20));
    expect([...mem]).toMatchInlineSnapshot(`
Array [
  100,
  97,
  116,
  97,
  6,
  0,
  0,
  0,
  5,
  0,
  0,
  0,
  4,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
]
`);
  });
});

describe('strings', () => {
  it('compiles strings', async () => {
    const code = `"hello world";`;
    const { exports } = await compileToWasmModule(code);
    expect(exports._start()).toBe(0);
    const mem = new Int8Array(exports.memory.buffer.slice(0, 11));
    expect([...mem]).toEqual([
      104, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100,
    ]);
    expect(new TextDecoder().decode(mem)).toEqual('hello world');
  });
  it('compiles character literals', async () => {
    const code = `'a';`;
    expect(await exec(code)).toEqual(97);
  });
});

describe('tuple structs', () => {
  it('lets you declare a new tuple type and construct it', async () => {
    const code = `
      struct Vector(u8,i32);
      let v = Vector(23_u8, 1234);
    `;
    const { exports } = await compileToWasmModule(code);
    const returnVal = exports._start();
    // expect(returnVal).toBe(5);
    expect(new Int8Array(exports.memory.buffer.slice(0, 1))[0]).toEqual(23);
    expect(new Int32Array(exports.memory.buffer.slice(1, 5))[0]).toEqual(1234);
  });
});

describe('extern declarations', () => {
  it('links with external modules', async () => {
    const code = `
      extern Printer {
        func print_num(num:i32):i32;
      }

      print_num(1);
    `;
    const wat = compileToWAT(code);
    const wasmModule = wabt.parseWat('', wat);
    wasmModule.validate();

    let printedNum: number | undefined = undefined;
    const module = await WebAssembly.instantiate(
      wasmModule.toBinary({ write_debug_names: true }).buffer,
      {
        Printer: {
          print_num: (num: number) => {
            printedNum = num;
            return num + 5;
          },
        },
      }
    );

    const result = (module.instance.exports as any)._start();
    expect(printedNum).toEqual(1);
    expect(result).toEqual(6);
  });
});
