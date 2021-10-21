import {
  ModuleCompiler,
  ModuleCompilerOptions,
  PAGE_SIZE,
} from '../ast-compiler.js';
import { compileToWAT, CompileToWatOptions } from './test-util';

type SnaxExports = {
  memory: WebAssembly.Memory;
  stackPointer: WebAssembly.Global;
  _start: () => any;
};

async function compileToWasmModule(
  input: string,
  options?: CompileToWatOptions
) {
  const { wat, ast, compiler, binary, sourceMap } = compileToWAT(input, {
    includeRuntime: false,
    ...options,
  });
  const module = await WebAssembly.instantiate(binary);
  const exports = module.instance.exports;
  return { exports: exports as SnaxExports, wat, ast, compiler, sourceMap };
}

async function exec(input: string, options?: ModuleCompilerOptions) {
  const { exports } = await compileToWasmModule(input, options);
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
        `    ${local.offset}: ${local.local.id} (${local.local.valueType})`
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

describe('empty module', () => {
  it('compiles to binaryen module', async () => {
    const output = await compileToWasmModule('', {
      includeRuntime: false,
    });
    expect(output.wat).toMatchSnapshot();
    expect(output.sourceMap).toMatchSnapshot();
  });

  it('compiles an empty program', async () => {
    const { wat } = compileToWAT('', { includeRuntime: true });
    expect(wat).toMatchSnapshot();
    expect(await exec('')).toBe(undefined);
  });

  it('compiles integers', async () => {
    const { wat, sourceMap } = compileToWAT('123;', {
      includeRuntime: false,
    });
    expect(wat).toMatchSnapshot();
    expect(sourceMap).toMatchSnapshot();
    const { exports } = await compileToWasmModule('123;', {
      includeRuntime: false,
    });
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

  it('compiles internal wasm operators', async () => {
    expect(await exec('$f32_floor(3.56);')).toBeCloseTo(3);
    expect(await exec('$i32_trunc_f32_s(3.56);')).toBe(3);
  });

  it('compiles expressions', async () => {
    const { wat, exports } = await compileToWasmModule('3+5*2-10/10;', {
      includeRuntime: false,
    });
    expect(exports._start()).toEqual(12);
  });

  it('allows adding/subtracting among different integer types that fit within 32 bits', async () => {
    expect(await exec('5 + 7_u8;')).toBe(12);
    expect(await exec('7_u8 + 5;')).toBe(12);
    expect(await exec('7_u16 + 5;')).toBe(12);
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
    expect(wat).toMatchSnapshot();
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
      struct Vector {x: i32; y:i32; z: i32;}
      reg v:Vector;
    `;
    await expect(compileToWasmModule(code)).rejects.toMatchInlineSnapshot(
      `[Error: BaseType: type {x: i32, y: i32, z: i32} does not have a corresponding value type]`
    );
  });

  it('does allow reg statements to be used for pointers to compound data types', async () => {
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
    expect(wat).toMatchSnapshot();
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
      let z:f32;
      x;
    `;
    const { wat, exports, compiler } = await compileToWasmModule(code, {
      includeRuntime: false,
    });
    expect(wat).toMatchSnapshot();
    expect(dumpFuncAllocations(compiler, 'main')).toMatchInlineSnapshot(`
      "stack:
          0: <x>s0-4 (i32)
          4: <y>s4-5 (bool)
          5: <z>s5-9 (f32)
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
        `[Error: SymbolResolutionError at  4:15: Reference to undeclared symbol y]`
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
    expect(wat).toMatchSnapshot();
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
      `[Error: SymbolResolutionError at  3:9: Reference to undeclared symbol y]`
    );
    await expect(
      exec(`
        let x = 3;
        5 = 4;
        x;
      `)
    ).rejects.toMatchInlineSnapshot(
      `[Error: NumberLiterals don't have lvalues]`
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
  describe('while loops', () => {
    it('compiles while statements', async () => {
      const code = `
          reg i = 0;
          while (i < 10) {
            i = i+1;
          }
          i;
        `;
      const { wat } = await compileToWasmModule(code, {
        includeRuntime: false,
      });
      expect(wat).toMatchSnapshot();
      expect(await exec(code)).toBe(10);
    });

    it('compiles nested while loops', async () => {
      const code = `
      reg i = 0;
      reg s = 1;
      while (i < 10) {
        reg j = 0;
        while (j < i) {
          j = j+1;
          s = s + j;
        }
        i = i+1;
      }
      s;
    `;
      const { exports } = await compileToWasmModule(code, {
        includeRuntime: false,
      });
      expect(exports._start()).toBe(167);
    });
  });
});

describe('functions', () => {
  it('compiles functions', async () => {
    expect(
      await exec(`
          func add(x:i32, y:i32) {
            return x+y;
          }
          reg x = 3;
          reg plus5 = add(x, 5);
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

xdescribe('runtime', () => {
  it('has malloc', async () => {
    expect(
      await exec(
        `
          let x = malloc(3);
          let y = malloc(4);
          y;
        `,
        { includeRuntime: true }
      )
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

  describe('@ operator', () => {
    it('does not yet work on literal values', async () => {
      const code = `
        let p:&i32 = @100;
        p;
      `;
      expect(
        compileToWasmModule(code)
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"NumberLiterals don't have lvalues"`
      );
    });

    it('Gets the address in linear memory where a non-immediate is stored', async () => {
      const code = `
        let p:i32 = 100;
        @p;
      `;
      const { exports } = await compileToWasmModule(code, {
        includeRuntime: false,
      });
      const result = exports._start();
      expect(result).toEqual(PAGE_SIZE - 4);
      expect(int32(exports.memory, result)).toEqual(100);
      expect(stackDump(exports, 4)).toEqual([100]);
    });

    it('works with expressions', async () => {
      const code = `
        let p:i32 = 100;
        reg j:&i32 = @p;
        @(j[3]);
      `;
      const { exports } = await compileToWasmModule(code, {
        includeRuntime: false,
      });
      const result = exports._start();
      expect(result).toEqual(PAGE_SIZE - 4 + 3 * 4);
    });

    it('puts values that are accessed through pointers on the stack', async () => {
      const code = `
        let p = 100;
        let j:&i32 = @p;
        j[0] = 200;
        p;
      `;
      const { exports, compiler } = await compileToWasmModule(code, {
        includeRuntime: false,
      });
      const result = exports._start();
      expect(result).toEqual(200);
      expect(dumpFuncAllocations(compiler, 'main')).toMatchInlineSnapshot(`
        "stack:
            0: <p>s0-4 (i32)
            4: <j>s4-8 (&i32)
        locals:
            0: <arp>r0:i32 (i32)
            1: <temp>r1:i32 (i32)
            2: <temp>r2:i32 (i32)"
      `);
      expect(stackDump(exports, 4)).toEqual([200, PAGE_SIZE - 8]);
    });
  });
});

describe('arrays', () => {
  it('compiles arrays', async () => {
    const input = `
      let a = "data";
      let arr = [6,5,4];
      let arr2 = [7,8,9];
      @arr;
    `;
    const { exports } = await compileToWasmModule(input, {
      includeRuntime: true,
    });
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
  it('supports arrays of structs', async () => {
    const code = `
      struct Point {x:i32; y:i32;}
      let arr = [Point::{x:6,y:5}, Point::{x:9,y:10}, Point::{x:15,y:16}];
      @arr;
    `;
    const { exports } = await compileToWasmModule(code);
    const result = exports._start();
    const mem = new Int32Array(
      exports.memory.buffer.slice(result, result + 6 * 4)
    );
    expect([...mem]).toEqual([6, 5, 9, 10, 15, 16]);
  });
});

describe('strings', () => {
  it('compiles character literals', async () => {
    const code = `'a';`;
    expect(await exec(code)).toEqual(97);
  });
  it('compiles strings', async () => {
    const code = `
      let s = "hello world\\n";
      @s;
    `;
    const {
      exports: { _start, memory },
    } = await compileToWasmModule(code, { includeRuntime: true });
    const strPointer = _start();
    expect(strPointer).toBe(PAGE_SIZE - 8);
    const bufferPointer = int32(memory, strPointer);
    expect(bufferPointer).toEqual(0);
    const bufferLen = int32(memory, strPointer + 4);
    expect(bufferLen).toEqual(12);

    expect(text(memory, bufferPointer, bufferLen)).toEqual('hello world\n');
  });
  it("lets you index into a string's buffer", async () => {
    const code = `
      let s = "abcdef";
      s.buffer[3];
    `;
    expect(await exec(code, { includeRuntime: true })).toEqual(
      'd'.charCodeAt(0)
    );
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

    expect(dumpFuncAllocations(compiler, 'main')).toMatchInlineSnapshot(`
      "stack:
          0: <v>s0-8 ({x: i32, y: i32})
      locals:
          0: <arp>r0:i32 (i32)"
      `);
  });

  it('allows structs to be nested', async () => {
    const code = `
      struct Vector {
        x: i32;
        y: i32;
      }
      struct Line {
        start: Vector;
        end: Vector;
      }
      let line:Line;
    `;
    const { compiler } = await compileToWasmModule(code, {
      includeRuntime: false,
    });
    expect(dumpFuncAllocations(compiler, 'main')).toMatchInlineSnapshot(`
      "stack:
          0: <line>s0-16 ({start: {x: i32, y: i32}, end: {x: i32, y: i32}})
      locals:
          0: <arp>r0:i32 (i32)"
      `);
  });

  it('allows assigning values to stack allocated struct fields', async () => {
    const code = `
      struct Vector {x: i32; y: i32;}
      let v:Vector;
      v.x = 3;
      v.y = 5;
    `;
    const { exports } = await compileToWasmModule(code, {
      includeRuntime: false,
    });
    exports._start();
    expect(stackDump(exports, 4)).toEqual([3, 5]);
  });

  it('allows assigning values to nested struct fields on the stack', async () => {
    const code = `
      struct Point {x: i32; y: i32;}
      struct Line {p1: Point; p2: Point;}
      let line:Line;
      line.p1.x = 3;
      line.p1.y = 5;
      line.p2.x = 7;
      line.p2.y = 9;
    `;
    const { exports } = await compileToWasmModule(code, {
      includeRuntime: false,
    });
    exports._start();
    expect(stackDump(exports, 4)).toEqual([3, 5, 7, 9]);
  });

  it('allows retrieving values from nested struct fields on the stack', async () => {
    const code = `
      struct Point {x: i32; y: i32;}
      struct Line {p1: Point; p2: Point;}
      let line:Line;
      line.p2.x = 7;
      line.p2.x;
    `;
    const { exports } = await compileToWasmModule(code, {
      includeRuntime: false,
    });
    expect(exports._start()).toEqual(7);
    expect(stackDump(exports, 4)).toEqual([0, 0, 7, 0]);
  });

  it('assignment will copy the struct', async () => {
    const code = `
      struct Point {x: i32; y: i32;}
      let p1:Point;
      let p2:Point;
      p1.x = 5;
      p1.y = 7;
      p2 = p1;
      p2.y;
    `;
    const { exports } = await compileToWasmModule(code, {
      includeRuntime: false,
    });
    expect(exports._start()).toEqual(7);
    expect(stackDump(exports, 4)).toEqual([5, 7, 5, 7]);
  });

  describe('struct literals', () => {
    it('lets you assign to a struct using a struct literal', async () => {
      const code = `
        struct Vector {x: i32;y: i32;}
        let v = Vector::{ x: 3, y: 5 };
        v.x;
      `;
      const { exports, compiler } = await compileToWasmModule(code);
      expect(dumpFuncAllocations(compiler, 'main')).toMatchInlineSnapshot(`
        "stack:
            0: <v>s0-8 ({x: i32, y: i32})
        locals:
            0: <arp>r0:i32 (i32)
            1: <temp>r1:i32 (i32)
            2: <temp>r2:i32 (i32)"
      `);
      const result = exports._start();
      const mem = new Int32Array(exports.memory.buffer.slice(0, 4 * 2));
      expect([...mem]).toEqual([0, 0]);
    });
    it('supports nested struct literals', async () => {
      const code = `
        struct Point {x:i32; y:i32;}
        struct Line {p1:Point; p2:Point;}
        let line = Line::{p1:Point::{x:1, y:2}, p2:Point::{x:3, y:4}};
        @line;
      `;
      const { exports, compiler } = await compileToWasmModule(code);
    });
  });
});

describe('tuple structs', () => {
  describe('construction', () => {
    let snax: SnaxExports;
    let compiler: ModuleCompiler;
    beforeEach(async () => {
      const code = `
        struct Vector(u8,i32);
        let v = Vector::(23_u8, 1234);
        @v;
      `;
      const output = await compileToWasmModule(code);
      snax = output.exports;
      compiler = output.compiler;
    });
    it('lets you declare a new tuple type and construct it', async () => {
      const vPointer = snax._start();
      expect(int8(snax.memory, vPointer)).toEqual(23);
      expect(int32(snax.memory, vPointer + 1)).toEqual(1234);
    });
  });

  describe('accessing members', () => {
    it('loads data from the correct offset', async () => {
      expect(
        await exec(`
          struct Vector(u8,i32);
          let v:Vector;
          v.0 = 23_u8;
          v.1 = 1234;
          v.1;
        `)
      ).toEqual(1234);
    });
    it('loads the correct amount of data for each offset', async () => {
      const code = `
        struct Vector(u8,i32);
        let v:Vector;
        v.0 = 23_u8;
        v.1 = 1234;
        v.0;
      `;
      expect(await exec(code)).toEqual(23);
    });
  });

  it('lets you pass structs as function parameters by reference', async () => {
    const code = `
      struct Vector(u8,i32);
      func add(v:&Vector) {
        return v.0 as i32 + v.1;
      }
      let someVec = Vector::(18_u8, 324);
      add(@someVec);
    `;
    expect(await exec(code)).toEqual(342);
  });

  it('lets you return structs as values, which will be copied.', async () => {
    const code = `
      struct Pair(i32,i32);
      func makePair(a:i32, b:i32) {
        return Pair::(a, b);
      }
      let p = makePair(1,2);
      makePair(3, 4);
      p.0;
    `;
    const { exports } = await compileToWasmModule(code);
    const result = exports._start();
    expect(stackDump(exports, 4)).toEqual([1, 2]);
    expect(result).toEqual(1);
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
    const { binary } = compileToWAT(code);

    let printedNum: number | undefined = undefined;
    const module = await WebAssembly.instantiate(binary, {
      Printer: {
        print_num: (num: number) => {
          printedNum = num;
          return num + 5;
        },
      },
    });

    const result = (module.instance.exports as any)._start();
    expect(printedNum).toEqual(1);
    expect(result).toEqual(6);
  });
});

describe('bugs that came up', () => {
  it('infers types in the right order across functions', async () => {
    const code = `
      func run() {
        let input = read(100);
      }
      
      func read(numBytes:i32) {
        let s = String::{buffer: malloc(numBytes), length: numBytes};
        return s;
      }
    `;
    const { exports } = await compileToWasmModule(code, {
      includeRuntime: true,
    });
  });

  it('lets you have functions that return floats', async () => {
    const code = `
      func run() {
        let sum:f32;
        sum = 3.4;
        return 3.4;
      }
    `;
    const { exports } = await compileToWasmModule(code, {
      includeRuntime: false,
      validate: false,
    });
    expect(exports._start()).toBe(undefined);
  });

  it('lets you call functions that return floats', async () => {
    const code = `
      func giveMeAFloat() {
        return 3.4;
      }
      func foo() {
        let afloat:f32;
        afloat = giveMeAFloat();
      }
      giveMeAFloat();
    `;
    const { exports } = await compileToWasmModule(code, {
      includeRuntime: false,
      validate: false,
    });
    expect(exports._start()).toBeCloseTo(3.4, 4);
  });
});
