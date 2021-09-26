import type { ModuleCompiler, ModuleCompilerOptions } from '../ast-compiler.js';
import { parseWat } from '../wabt-util.js';
import { PAGE_SIZE } from '../wasm-ast.js';
import { makeCompileToWAT } from './test-util';

let compileToWAT: ReturnType<typeof makeCompileToWAT>;
beforeAll(async () => {
  compileToWAT = makeCompileToWAT();
});

type SnaxExports = {
  memory: WebAssembly.Memory;
  stackPointer: WebAssembly.Global;
  _start: () => any;
};

async function compileToWasmModule(
  input: string,
  options?: ModuleCompilerOptions
) {
  const { wat, ast, compiler } = await compileToWAT(input, options);
  const wasmModule = await parseWat('', wat);
  wasmModule.validate();
  const result = wasmModule.toBinary({ write_debug_names: true });
  const module = await WebAssembly.instantiate(result.buffer);
  const exports = module.instance.exports;
  return { exports: exports as SnaxExports, wat, ast, compiler };
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
  if (offset < 0) {
    offset = memory.buffer.byteLength + offset;
  }
  return new Int32Array(memory.buffer.slice(offset, offset + 4))[0];
}

/**
 * Get an 8 bit number out of a memory buffer from the given byte offset
 */
function int8(memory: WebAssembly.Memory, offset: number) {
  if (offset < 0) {
    offset = memory.buffer.byteLength + offset;
  }
  return new Int8Array(memory.buffer.slice(offset, offset + 1))[0];
}

function stackDump(exports: SnaxExports, bytes: 1 | 4 = 1) {
  const slice = exports.memory.buffer.slice(
    exports.stackPointer.value,
    PAGE_SIZE
  );
  switch (bytes) {
    case 1:
      return [...new Int8Array(slice)];
    case 4:
      return [...new Int32Array(slice)];
  }
}

function dumpFuncAllocations(compiler: ModuleCompiler, funcName: string) {
  const funcAllocator =
    compiler.moduleAllocator.funcAllocatorMap.getByFuncNameOrThrow(funcName);
  return [
    'stack:',
    ...funcAllocator.stack.map(
      (s) => `    ${s.offset}: ${s.id} (${s.dataType.name})`
    ),
    'locals:',
    ...funcAllocator.locals.map(
      (local) =>
        `    ${local.offset}: ${local.local.fields.id} (${local.local.fields.valueType})`
    ),
  ].join('\n');
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
    const { wat } = await compileToWAT('', { includeRuntime: true });
    expect(wat).toMatchInlineSnapshot(`
      "(module
        (memory (;0;) 1)
        (global $g0:#SP (mut i32) (i32.const 0))
        (global $g1:next (mut i32) (i32.const 0))
        (func $<main>f0
          (local $<arp>r0:i32 i32))
        (func $<malloc>f1 (param $p0:numBytes i32) (result i32)
          (local $<arp>r0:i32 i32)
          (global.set $g0:#SP
            (i32.sub
              (global.get $g0:#SP)
              (i32.const 4)))
          (local.set $<arp>r0:i32
            (global.get $g0:#SP))
          (i32.store
            (local.get $<arp>r0:i32)
            (global.get $g1:next))
          (global.set $g1:next
            (i32.add
              (global.get $g1:next)
              (local.get $p0:numBytes)))
          (drop
            (global.get $g1:next))
          (return
            (i32.load
              (local.get $<arp>r0:i32))))
        (func (;2;)
          (global.set $g0:#SP
            (i32.const 65536))
          (call $<main>f0))
        (export \\"_start\\" (func 2))
        (export \\"memory\\" (memory 0))
        (export \\"stackPointer\\" (global 0))
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
    const { exports } = await compileToWasmModule('3+5*2-10/10;');
    expect(exports._start()).toEqual(12);
  });

  it('converts between ints and floats', async () => {
    // const { exports, wasmModule } = await compileToWasmModule('3+5.2;');
    // expect(exports._start()).toBeCloseTo(8.2);
  });
});
describe('reg statements', () => {
  it('compiles reg statements into function local allocations', async () => {
    const code = `
      reg x:i32;
      reg y:bool;
      reg z:f64;
    `;
    const { wat, compiler } = await compileToWasmModule(code, {
      includeRuntime: false,
    });
    expect(wat).toMatchInlineSnapshot(`
      "(module
        (memory (;0;) 1)
        (global $g0:#SP (mut i32) (i32.const 0))
        (func $<main>f0
          (local $<arp>r0:i32 i32) (local $<x>r1:i32 i32) (local $<y>r2:i32 i32) (local $<z>r3:f64 f64)
          (nop)
          (nop)
          (nop))
        (func (;1;)
          (global.set $g0:#SP
            (i32.const 65536))
          (call $<main>f0))
        (export \\"_start\\" (func 1))
        (export \\"memory\\" (memory 0))
        (export \\"stackPointer\\" (global 0))
        (type (;0;) (func)))
      "
      `);
    expect(dumpFuncAllocations(compiler, 'main')).toMatchInlineSnapshot(`
      "stack:
      locals:
          0: <arp>r0:i32 (i32)
          1: <x>r1:i32 (i32)
          2: <y>r2:i32 (i32)
          3: <z>r3:f64 (f64)"
      `);
  });

  it('does not allow reg statements to be used for compound data types', async () => {
    const code = `
      struct Vector {x: i32; y:i32;}
      reg v:Vector;
    `;
    await expect(compileToWasmModule(code)).rejects.toMatchInlineSnapshot(
      `[Error: BaseType: type {x: i32, y: i32} does not have a corresponding value type]`
    );
  });

  it('does allow reg statements to be used pointers to compound data types', async () => {
    const code = `
      struct Vector {x: i32; y:i32;}
      reg v:&Vector;
    `;
    const { compiler } = await compileToWasmModule(code, {
      includeRuntime: false,
    });
    expect(dumpFuncAllocations(compiler, 'main')).toMatchInlineSnapshot(`
      "stack:
      locals:
          0: <arp>r0:i32 (i32)
          1: <v>r1:i32 (i32)"
      `);
  });

  it('compiles reg statements', async () => {
    const code = 'reg x = 3; x;';
    const { wat, exports } = await compileToWasmModule(code, {
      includeRuntime: false,
    });
    expect(wat).toMatchInlineSnapshot(`
      "(module
        (memory (;0;) 1)
        (global $g0:#SP (mut i32) (i32.const 0))
        (func $<main>f0 (result i32)
          (local $<arp>r0:i32 i32) (local $<x>r1:i32 i32)
          (local.set $<x>r1:i32
            (i32.const 3))
          (return
            (local.get $<x>r1:i32)))
        (func (;1;) (result i32)
          (global.set $g0:#SP
            (i32.const 65536))
          (call $<main>f0))
        (export \\"_start\\" (func 1))
        (export \\"memory\\" (memory 0))
        (export \\"stackPointer\\" (global 0))
        (type (;0;) (func (result i32))))
      "
    `);
    expect(exports._start()).toBe(3);
  });
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  xit('it does not allow storing values that do not fit into a register', () => {});
});

describe('let statements', () => {
  it('allocates space on the stack, and initializes values to 0', async () => {
    const code = `
      let x:i32;
      let y:bool;
      x;
    `;
    const { wat, exports, compiler } = await compileToWasmModule(code, {
      includeRuntime: false,
    });
    expect(wat).toMatchInlineSnapshot(`
      "(module
        (memory (;0;) 1)
        (global $g0:#SP (mut i32) (i32.const 0))
        (func $<main>f0 (result i32)
          (local $<arp>r0:i32 i32)
          (global.set $g0:#SP
            (i32.sub
              (global.get $g0:#SP)
              (i32.const 5)))
          (local.set $<arp>r0:i32
            (global.get $g0:#SP))
          (memory.fill
            (local.get $<arp>r0:i32)
            (i32.const 0)
            (i32.const 4))
          (memory.fill
            (i32.add
              (local.get $<arp>r0:i32)
              (i32.const 4))
            (i32.const 0)
            (i32.const 1))
          (return
            (i32.load
              (local.get $<arp>r0:i32))))
        (func (;1;) (result i32)
          (global.set $g0:#SP
            (i32.const 65536))
          (call $<main>f0))
        (export \\"_start\\" (func 1))
        (export \\"memory\\" (memory 0))
        (export \\"stackPointer\\" (global 0))
        (type (;0;) (func (result i32))))
      "
    `);
    expect(dumpFuncAllocations(compiler, 'main')).toMatchInlineSnapshot(`
      "stack:
          0: <x>s0-4 (i32)
          4: <y>s4-5 (bool)
      locals:
          0: <arp>r0:i32 (i32)"
    `);
    expect(exports._start()).toEqual(0);
  });
});

describe('block compilation', () => {
  it('compiles blocks', async () => {
    const code = 'let x = 3; let y = x+4; y;';
    const { exports } = await compileToWasmModule(code);
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
  it('compiles assignments to registers', async () => {
    const code = `
      reg a:i32;
      a=54;
      a;
    `;
    const { wat, exports } = await compileToWasmModule(code, {
      includeRuntime: false,
    });
    expect(wat).toMatchInlineSnapshot(`
      "(module
        (memory (;0;) 1)
        (global $g0:#SP (mut i32) (i32.const 0))
        (func $<main>f0 (result i32)
          (local $<arp>r0:i32 i32) (local $<a>r1:i32 i32)
          (nop)
          (drop
            (local.tee $<a>r1:i32
              (i32.const 54)))
          (return
            (local.get $<a>r1:i32)))
        (func (;1;) (result i32)
          (global.set $g0:#SP
            (i32.const 65536))
          (call $<main>f0))
        (export \\"_start\\" (func 1))
        (export \\"memory\\" (memory 0))
        (export \\"stackPointer\\" (global 0))
        (type (;0;) (func (result i32))))
      "
      `);
    expect(exports._start()).toBe(54);
  });
  it('compiles assignments', async () => {
    expect(
      await exec(`
        let x:i32;
        x = 4;
        x;
      `)
    ).toBe(4);
  });

  it('does not compile invalid assignments', async () => {
    await expect(
      exec(`
        let x = 3;
        y = 4;
        y;
      `)
    ).rejects.toMatchInlineSnapshot(
      `[Error: Reference to undeclared symbol y]`
    );
    await expect(
      exec(`
        let x = 3;
        5 = 4;
        x;
      `)
    ).rejects.toMatchInlineSnapshot(
      `[Error: ASSIGN: Can't assign to NumberLiteral: something that is not a resolved symbol or a memory address]`
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
          func add(x:i32, y:i32) {
            return x+y;
          }
          let x = 3;
          let plus5 = add(x, 5);
          plus5;
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
        reg p:&i32 = 0 as! &i32;
        p[0] = 10;
        p[0];
      `;
    expect(await exec(code)).toEqual(10);
  });
  it('allows pointer arithmetic through array indexing', async () => {
    const code = `
      reg p:&i32 = 0 as! &i32;
      reg q:&i32 = 4 as! &i32;
      q[0] = 175;
      p[1];
    `;
    const { exports } = await compileToWasmModule(code);
    expect(exports._start()).toEqual(175);
    const mem = new Int32Array(exports.memory.buffer.slice(0, 8));
    expect([...mem]).toEqual([0, 175]);
  });
  it('allows assigning to pointer offsets with array indexing', async () => {
    const code = `
      reg p:&i32 = 0 as! &i32;
      p[1] = 174;
    `;
    const { exports } = await compileToWasmModule(code);
    expect(exports._start()).toEqual(174);
    expect(int32(exports.memory, 0)).toEqual(0);
    expect(int32(exports.memory, 4)).toEqual(174);
  });
  it('respects the size of the type being pointed to', async () => {
    const code = `
      reg p:&i16 = 0 as! &i16;
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
      reg p:&i32 = 0 as! &i32;
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
      reg p:&i32 = 0 as! &i32;
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
      reg p:&u8 = 0 as! &u8;
      p[0] = 1_u8;
      p[1] = 2_u8;
      reg q:&u8 = p;
      q[1] = 3_u8;
    `;
    const { exports } = await compileToWasmModule(code);
    expect(exports._start()).toEqual(3);
    const mem = new Int8Array(exports.memory.buffer.slice(0, 2));
    expect([...mem]).toEqual([1, 3]);
  });
  it('allows casting a pointer to an i32', async () => {
    const code = `
      reg p:&u8 = 100 as! &u8;
      reg j:i32 = p as i32;
      j;
    `;
    expect(await exec(code)).toEqual(100);
  });

  xdescribe('@ operator', () => {
    it('gets the address in linear memory where the value is stored, even for an immediate', async () => {
      const code = `
        let p:&i32 = @100;
        p;
      `;
      const { exports } = await compileToWasmModule(code);
      const result = exports._start();
      expect(int32(exports.memory, result)).toEqual(100);
      expect(stackDump(exports, 4)).toMatchInlineSnapshot(`
        Array [
          100,
          65528,
        ]
      `);
    });

    xit('Gets the address in linear memory where a non-immediate is stored', async () => {
      const code = `
        let p = 100;
        @p;
      `;
      const { exports } = await compileToWasmModule(code);
      const result = exports._start();
      expect(int32(exports.memory, result)).toEqual(200);
    });

    xit('puts values that are accessed through pointers on the stack', async () => {
      const code = `
        let p = 100;
        let j:&i32 = @p;
        j[0] = 200;
        p;
      `;
      expect(await exec(code)).toEqual(200);
    });
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
    const { exports } = await compileToWasmModule(input);
    const result = exports._start();
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
    expect(strPointer).toBe(PAGE_SIZE - 8);
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
  it('treats structs as values on the stack', async () => {
    const code = `
      struct Vector {
        x: i32;
        y: i32;
      }
      let v:Vector;
    `;
    const { wat, compiler } = await compileToWasmModule(code, {
      includeRuntime: false,
    });
    expect(wat).toMatchInlineSnapshot(`
      "(module
        (memory (;0;) 1)
        (global $g0:#SP (mut i32) (i32.const 0))
        (func $<main>f0
          (local $<arp>r0:i32 i32)
          (global.set $g0:#SP
            (i32.sub
              (global.get $g0:#SP)
              (i32.const 8)))
          (local.set $<arp>r0:i32
            (global.get $g0:#SP))
          (memory.fill
            (local.get $<arp>r0:i32)
            (i32.const 0)
            (i32.const 8)))
        (func (;1;)
          (global.set $g0:#SP
            (i32.const 65536))
          (call $<main>f0))
        (export \\"_start\\" (func 1))
        (export \\"memory\\" (memory 0))
        (export \\"stackPointer\\" (global 0))
        (type (;0;) (func)))
      "
    `);

    expect(dumpFuncAllocations(compiler, 'main')).toMatchInlineSnapshot(`
      "stack:
          0: <v>s0-8 ({x: i32, y: i32})
      locals:
          0: <arp>r0:i32 (i32)"
      `);
  });
  xit('allows assigning values to stack allocated struct fields', async () => {
    const code = `
      struct Vector {x: i32; y: i32;}
      let v:Vector;
      v.x = 3;
      v.y = 5;
    `;
    const { wat } = await compileToWasmModule(code, { includeRuntime: false });
    expect(wat).toMatchInlineSnapshot();
  });
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
    const mem = new Int32Array(exports.memory.buffer.slice(0, 4 * 2));
    expect([...mem]).toMatchInlineSnapshot(`
      Array [
        0,
        0,
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
  describe('construction', () => {
    let snax: SnaxExports;
    let compiler: ModuleCompiler;
    beforeEach(async () => {
      const code = `
        struct Vector(u8,i32);
        let v = Vector(23_u8, 1234);
        v;
      `;
      const output = await compileToWasmModule(code);
      snax = output.exports;
      compiler = output.compiler;
    });
    it('lets you declare a new tuple type and construct it', async () => {
      const vPointer = snax._start();
      expect(int8(snax.memory, vPointer)).toEqual(23);
      expect(int32(snax.memory, vPointer + 1)).toEqual(1234);
      expect(stackDump(snax)).toMatchInlineSnapshot(`
        Array [
          23,
          -46,
          4,
          0,
          0,
          -9,
          -1,
          0,
          0,
        ]
      `);
    });

    xit('allocates structs on the stack', async () => {
      const vPointer = snax._start();
      expect(vPointer - PAGE_SIZE).toEqual(-9);
      expect(snax.stackPointer.value - PAGE_SIZE).toEqual(-5);
    });
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
        return v.0 as i32 + v.1;
      }
      let someVec = Vector(18_u8, 324);
      add(someVec);
    `;
    expect(await exec(code)).toEqual(342);
  });

  it('allocates structs on the stack, so returning them is invalid', async () => {
    const code = `
      struct Pair(i32,i32);
      func makePair(a:i32, b:i32) {
        return Pair(a, b);
      }
      let p = makePair(1,2);
      makePair(3, 4);
      p.0;
    `;
    const snax = (await compileToWasmModule(code)).exports;
    const result = snax._start();
    expect(stackDump(snax, 4)).toMatchInlineSnapshot(`
      Array [
        65524,
      ]
    `);
    expect(result).toEqual(3);
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
    const { wat } = await compileToWAT(code);
    const wasmModule = await parseWat('', wat);
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
