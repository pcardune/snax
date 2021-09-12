import loadWabt from 'wabt';
import type { ModuleCompilerOptions } from '../ast-compiler.js';
import { WabtModule, makeCompileToWAT } from './test-util';

let wabt: WabtModule;
let compileToWAT: ReturnType<typeof makeCompileToWAT>;
beforeAll(async () => {
  wabt = await loadWabt();
  compileToWAT = makeCompileToWAT(wabt);
});

type WasiABI = {
  memory: WebAssembly.Memory;
  _start: () => any;
};

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
  return { exports: exports as WasiABI, wasmModule };
}

async function exec(input: string) {
  const { exports } = await compileToWasmModule(input, {
    includeRuntime: true,
  });
  return exports._start();
}

/**
 * Get a 32 bit number out of a memory buffer from the given byte offset
 */
function int32(memory: WebAssembly.Memory, offset: number) {
  return new Int32Array(memory.buffer.slice(offset, offset + 4))[0];
}

/**
 * get text out of a memory buffer
 */
function text(memory: WebAssembly.Memory, offset: number, length: number) {
  const buffer = new Int8Array(memory.buffer.slice(offset, offset + length));
  return new TextDecoder().decode(buffer);
}

describe('simple expressions', () => {
  it('compiles an empty program', async () => {
    expect(compileToWAT('', { includeRuntime: true })).toMatchInlineSnapshot(`
"(module
  (memory (;0;) 1)
  (export \\"memory\\" (memory 0))
  (global $g0:#SP (mut i32) (i32.const 0))
  (global $g1:next (mut i32) (i32.const 0))
  (func $f0:main)
  (export \\"_start\\" (func $f0:main))
  (func $f1:malloc (param $p0:numBytes i32) (result i32)
    (local $l1 i32)
    (local.set $l1
      (global.get $g1:next))
    (global.set $g1:next
      (i32.add
        (global.get $g1:next)
        (local.get $p0:numBytes)))
    (drop
      (global.get $g1:next))
    (return
      (local.get $l1)))
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

  it('compiles cast/conversion operators', async () => {
    expect(await exec('1234 as! u8;')).toBe(210);
  });

  it('compiles remainder operator', async () => {
    expect(await exec('5%3;')).toBe(2);
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
    const input = `
      let a = "data";
      let arr = [6,5,4];
      let arr2 = [7,8,9];
      arr;
    `;
    expect(compileToWAT(input)).toMatchInlineSnapshot(`
"(module
  (memory (;0;) 1)
  (export \\"memory\\" (memory 0))
  (data $d0 (i32.const 0) \\"data\\")
  (global $g0:#SP (mut i32) (i32.const 0))
  (global $g1:next (mut i32) (i32.const 4))
  (func $f0:main (result i32)
    (local $l0 i32) (local $l1 i32) (local $l2 i32) (local $l3 i32)
    (local.set $l1
      (call $f1:malloc
        (i32.const 8)))
    (i32.store
      (local.get $l1)
      (i32.const 0))
    (i32.store offset=4
      (local.get $l1)
      (i32.const 4))
    (local.set $l0
      (local.get $l1))
    (local.set $l2
      (call $f1:malloc
        (i32.const 12)))
    (i32.store
      (local.get $l2)
      (i32.const 6))
    (i32.store offset=4
      (local.get $l2)
      (i32.const 5))
    (i32.store offset=8
      (local.get $l2)
      (i32.const 4))
    (local.set $l1
      (local.get $l2))
    (local.set $l3
      (call $f1:malloc
        (i32.const 12)))
    (i32.store
      (local.get $l3)
      (i32.const 7))
    (i32.store offset=4
      (local.get $l3)
      (i32.const 8))
    (i32.store offset=8
      (local.get $l3)
      (i32.const 9))
    (local.set $l2
      (local.get $l3))
    (return
      (local.get $l1)))
  (export \\"_start\\" (func $f0:main))
  (func $f1:malloc (param $p0:numBytes i32) (result i32)
    (local $l1 i32)
    (local.set $l1
      (global.get $g1:next))
    (global.set $g1:next
      (i32.add
        (global.get $g1:next)
        (local.get $p0:numBytes)))
    (drop
      (global.get $g1:next))
    (return
      (local.get $l1)))
  (type (;0;) (func (result i32)))
  (type (;1;) (func (param i32) (result i32))))
"
`);
    const { exports } = await compileToWasmModule(input);
    const result = exports._start();
    expect(result).toBe(12);
    const mem = new Int32Array(
      exports.memory.buffer.slice(result, result + 3 * 4)
    );
    expect([...mem]).toMatchInlineSnapshot(`
Array [
  6,
  5,
  4,
]
`);
  });
});

describe('strings', () => {
  it('compiles strings', async () => {
    const code = `"hello world\\n";`;
    const {
      exports: { _start, memory },
    } = await compileToWasmModule(code);
    const strPointer = _start();
    expect(strPointer).toBe(12);
    const bufferPointer = int32(memory, strPointer);
    expect(bufferPointer).toEqual(0);
    const bufferLen = int32(memory, strPointer + 4);
    expect(bufferLen).toEqual(12);

    expect(text(memory, bufferPointer, bufferLen)).toEqual('hello world\n');
  });
  it('compiles character literals', async () => {
    const code = `'a';`;
    expect(await exec(code)).toEqual(97);
  });
  it("lets you index into a string's buffer", async () => {
    expect(await exec(`"abcdef".buffer[3];`)).toEqual('d'.charCodeAt(0));
  });
});

describe('object structs', () => {
  it('lets you declare a new struct type and construct it', async () => {
    const code = `
      struct Vector {
        x: i32;
        y: i32;
      }
      let v = Vector::{ x: 3, y: 5 };
      v;
    `;
    const { exports } = await compileToWasmModule(code);
    const result = exports._start();
    expect(result).toEqual(0);
    const mem = new Int32Array(exports.memory.buffer.slice(0, 4 * 2));
    expect([...mem]).toMatchInlineSnapshot(`
Array [
  3,
  5,
]
`);
  });

  it('lets you access members of the struct', async () => {
    expect(
      await exec(`
        struct Vector {x: i32; y: u8;}
        let v = Vector::{x:3, y:5_u8};
        v.x;
      `)
    ).toEqual(3);
    expect(
      await exec(`
        struct Vector {x: i32; y: u8;}
        let v = Vector::{x:3, y:5_u8};
        v.y;
      `)
    ).toEqual(5);
  });
});

describe('tuple structs', () => {
  it('lets you declare a new tuple type and construct it', async () => {
    const code = `
      struct Vector(u8,i32);
      let v = Vector(23_u8, 1234);
    `;
    const { exports } = await compileToWasmModule(code);
    exports._start();
    expect(new Int8Array(exports.memory.buffer.slice(0, 1))[0]).toEqual(23);
    expect(new Int32Array(exports.memory.buffer.slice(1, 5))[0]).toEqual(1234);
  });

  describe('accessing members', () => {
    it('loads data from the correct offset', async () => {
      expect(
        await exec(`
          struct Vector(u8,i32);
          let v = Vector(23_u8, 1234);
          v.1;
        `)
      ).toEqual(1234);
    });
    it('loads the correct amount of data for each offset', async () => {
      expect(
        await exec(`
          struct Vector(u8,i32);
          let v = Vector(23_u8, 1234);
          v.0;
        `)
      ).toEqual(23);
    });
  });

  it('lets you pass structs as function parameters by reference', async () => {
    const code = `
      struct Vector(u8,i32);
      func add(v:&Vector) {
        return v.0;
      }
      let someVec = Vector(18_u8, 324);
      add(someVec);
    `;
    expect(await exec(code)).toEqual(18);
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
    expect(wat).toMatchInlineSnapshot(`
"(module
  (import \\"Printer\\" \\"print_num\\" (func $f0:print_num (param i32) (result i32)))
  (memory (;0;) 1)
  (export \\"memory\\" (memory 0))
  (global $g0:#SP (mut i32) (i32.const 0))
  (global $g1:next (mut i32) (i32.const 0))
  (func $f1:main (result i32)
    (local $l0 i32)
    (return
      (call $f0:print_num
        (i32.const 1))))
  (export \\"_start\\" (func $f1:main))
  (func $f2:malloc (param $p0:numBytes i32) (result i32)
    (local $l1 i32)
    (local.set $l1
      (global.get $g1:next))
    (global.set $g1:next
      (i32.add
        (global.get $g1:next)
        (local.get $p0:numBytes)))
    (drop
      (global.get $g1:next))
    (return
      (local.get $l1)))
  (type (;0;) (func (param i32) (result i32)))
  (type (;1;) (func (result i32))))
"
`);
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
