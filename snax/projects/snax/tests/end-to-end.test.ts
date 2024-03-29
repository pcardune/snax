import { FileCompiler, PAGE_SIZE } from '../ast-compiler.js';
import { SNAXParser } from '../snax-parser.js';
import { isFile } from '../spec-gen.js';
import {
  compileToWasmModule,
  compileToWAT,
  exec,
  int32,
  int32Slice,
  int8,
  type SnaxExports,
} from './test-util';

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

function dumpFuncAllocations(compiler: FileCompiler, funcName: string) {
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
    const { wat } = await compileToWAT('', {
      includeRuntime: true,
      optimize: true,
    });
    expect(wat).toMatchSnapshot();
  });

  it('compiles integers', async () => {
    const { wat, sourceMap } = await compileToWAT('123;', {
      includeRuntime: false,
    });
    expect(wat).toMatchSnapshot();
    expect(sourceMap).toMatchSnapshot();
    const { exports } = await compileToWasmModule('123;', {
      includeRuntime: false,
    });
    expect(exports._start()).toEqual(123);
  });

  it('compiles negative integers and floats', async () => {
    expect(await exec('-34;')).toBe(-34);
    expect(await exec('-3.14;')).toBeCloseTo(-3.14, 4);
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
    expect(await exec('!true;')).toBe(0);
    expect(await exec('!false;')).toBe(1);
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
    expect(await exec('5 % 3;')).toBe(2);
    expect(await exec('-5 % 3;')).toBe(-2);
    expect(await exec('-5 % -3;')).toBe(-2);
    // TODO: is there a test for unsigned remainder? Why is
    // there a different wasm instruction?
    expect(await exec('5_u32 % 3;')).toBe(2);
  });

  it('compiles internal wasm operators', async () => {
    expect(await exec('$f32_floor(3.56);')).toBeCloseTo(3);
    expect(await exec('$f32_floor(-3.56);')).toBeCloseTo(-4);
    expect(await exec('$f32_trunc(3.56);')).toBeCloseTo(3);
    expect(await exec('$f32_trunc(-3.56);')).toBeCloseTo(-3);
    expect(await exec('$f32_abs(3.56);')).toBeCloseTo(3.56);
    expect(await exec('$f32_abs(-3.56);')).toBeCloseTo(3.56);
    expect(await exec('$f32_sqrt(3.56);')).toBeCloseTo(Math.sqrt(3.56));
    expect(await exec('$f32_ceil(3.56);')).toBeCloseTo(4);
    expect(await exec('$f32_nearest(3.56);')).toBeCloseTo(4);

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

describe('numbers', () => {
  it('compiles 64 bit numbers correctly', async () => {
    expect(String(await exec('3_i64+4_i64;'))).toBe('7');
  });
  it('does not truncate 64 bit integers', async () => {
    expect(String(await exec('1152921504706846977;'))).toBe(
      '1152921504706846977'
    );
  });
  it('Returns BigInts for 64 bit integers', async () => {
    const value = await exec('1152921504706846977;');
    expect(value).toEqual(BigInt('1152921504706846977'));
  });
  it('chooses f32 floats by default', async () => {
    expect(1.234567898765432 - (await exec('1.234567898765432;'))).toBe(
      1.813493888391804e-8
    );
  });
  it('does not lose precision on 64 bit floats', async () => {
    const jsNum = 1.234567898765432;
    expect(1.234567898765432 - (await exec('1.234567898765432_f64;'))).toBe(0);
  });
  it('Throws a type error for number literals that do not fit', async () => {
    expect(
      exec('295147905179352825856;')
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"TypeResolutionError at :1:1: 295147905179352825856 doesn't fit into a 64 bit integer."`
    );
  });
  test.todo(
    'Throws a type error for float literals that will lose precision in an f64'
  );
});

describe('compiler calls', () => {
  it('lets you access the heap start and heap end', async () => {
    expect(await exec('$heap_start();')).toBe(0);
    expect(await exec('$heap_end();')).toBe(65536);
  });

  it('lets you access the size of a type', async () => {
    expect(await exec(`$size_of(i64);`)).toBe(8);
    expect(
      await exec(`
        struct Square {
          x: f32;
          y: f32;
          size: f32;
          color: u8;
        }
        $size_of(Square);
      `)
    ).toBe(4 + 4 + 4 + 1);
    expect(
      await exec(`
        struct Point { x1: i32; y1: i32;}
        let a = Point::{x1: 43, y1: 54};
        $size_of(a);
      `)
    ).toBe(4 + 4);
  });

  xit('lets you print things', async () => {
    expect(await exec('$print("foo");', { includeRuntime: true }));
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

  it('initializes reg values to 0 if there is no expression', async () => {
    expect(
      await exec(`
      reg a:i32 = 1;
      {
        reg b:i32 = 2;
      }
      {
        reg c:i32;
        a = a+c;
      }
      a;
    `)
    ).toBe(1);
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

  it('lets you assign initial values with various types', async () => {
    const code = `
      let a:u8 = 1;
      let b:i8 = 1;
      let x:f64 = 4.32;
      let y:f64 = 4.56_f64;
      x;
    `;
    const { exports } = await compileToWasmModule(code, {
      includeRuntime: false,
    });
    expect(exports._start()).toBeCloseTo(4.32);
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
        `[Error: SymbolResolutionError at :4:15: Reference to undeclared symbol y]`
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
      `[Error: SymbolResolutionError at :3:9: Reference to undeclared symbol y]`
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

describe('Comparison Operators', () => {
  it('compiles comparison operators', async () => {
    expect(await exec(`3 < 4;`)).toBe(1);
    expect(await exec(`4 < 4;`)).toBe(0);
    expect(await exec(`4 <= 4;`)).toBe(1);
    expect(await exec(`4 > 3;`)).toBe(1);
    expect(await exec(`4 > 4;`)).toBe(0);
    expect(await exec(`4 >= 4;`)).toBe(1);
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
      expect(exports._start()).toBe(166);
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
  it('exports functions marked pub', async () => {
    const code = `
      pub func addNums(x:i32, y:i32) {
        return x+y;
      }
    `;
    const { exports } = await compileToWasmModule(code, {
      includeRuntime: false,
    });
    expect((exports as any).addNums(3, 4)).toEqual(7);
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

    it('works with function return values', async () => {
      const code = `
        struct Point { x:i32; y:i32; }
        func foo() {
          return Point::{ x:3, y:5 };
        }
        @foo();
      `;
      const { exports } = await compileToWasmModule(code, {
        includeRuntime: false,
      });
      const addr = exports._start();
      expect(int32Slice(exports.memory, addr, 8)).toEqual([3, 5]);
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

  it('compiles array indexing', async () => {
    expect(
      await exec(`
        let arr = [1,2,3];
        arr[2];
      `)
    ).toEqual(3);
  });

  it('compiles array indexing assignment', async () => {
    expect(
      await exec(`
        let arr = [1,2,3];
        arr[2] = 5;
        arr[2];
      `)
    ).toEqual(5);
  });

  it('compiles array initializers', async () => {
    const code = `
      let arr = [32+22:5];
      @arr;
    `;
    const { exports } = await compileToWasmModule(code, {
      includeRuntime: true,
    });
    const result = exports._start();
    const mem = new Int32Array(
      exports.memory.buffer.slice(result, result + 5 * 4)
    );
    expect([...mem]).toMatchInlineSnapshot(`
      Array [
        54,
        54,
        54,
        54,
        54,
      ]
    `);
  });

  it('compiles array type expressions', async () => {
    const code = `
      let arr:[i32:3];
      arr = [1, 2, 3];
      @arr;
    `;
    const { exports } = await compileToWasmModule(code, {
      includeRuntime: true,
    });
    const result = exports._start();
    const mem = new Int32Array(
      exports.memory.buffer.slice(result, result + 3 * 4)
    );
    expect([...mem]).toMatchInlineSnapshot(`
      Array [
        1,
        2,
        3,
      ]
    `);
  });

  it('supports multidimensional arrays', async () => {
    const code = `
      let arr:[[i32:2]:2];
      arr = [[1, 2], [3, 4]];
      @arr;
    `;
    const { exports } = await compileToWasmModule(code, {
      includeRuntime: true,
    });
    const result = exports._start();
    const mem = new Int32Array(
      exports.memory.buffer.slice(result, result + 4 * 4)
    );
    expect([...mem]).toEqual([1, 2, 3, 4]);
  });

  it('supports accessing values in multi-dimensional', async () => {
    const code = `
      let arr:[[i32:2]:2];
      arr = [[1, 2], [3, 4]];
      arr[1][0];
    `;
    expect(await exec(code)).toBe(3);
  });

  it('supports assigning values in multi-dimensional', async () => {
    const code = `
      let arr:[[i32:2]:2];
      arr = [[1, 2], [3, 4]];
      arr[1][0] = 52;
      arr[1][0];
    `;
    expect(await exec(code)).toBe(52);
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

  it('Allows referencing a struct type', async () => {
    const code = `
      struct Vector {x: i32; y: i32;}
      func make_vec(x: i32, y: i32):Vector {
        return Vector::{x:x, y:y};
      }
      let v = make_vec(3, 4);
      v.x;
    `;
    expect(await exec(code)).toEqual(3);
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
            8: <temp>s8-16 ({x: i32, y: i32})
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
    let compiler: FileCompiler;
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

  it('lets you pass struct literals as function parameters by ref', async () => {
    const code = `
      struct Vector(u8,i32);
      func add(v:&Vector) {
        return v.0 as i32 + v.1;
      }
      add(@Vector::(18_u8, 324));
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
    expect(stackDump(exports, 4)).toEqual([1, 2, 1, 2, 3, 4]);
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
    const { binary } = await compileToWAT(code);

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

describe('module declarations', () => {
  it('allows calling functions inside a module declaration', async () => {
    const code = `
      module math {
        func add(a:i32, b:i32) {
          return a+b;
        }
        func add100(a:i32) {
          return add(a, 100);
        }
      }
      func add(a:i32, b:i32) {
        return a + 500;
      }
      pub func test1() {
        return math::add(1,2);
      }
      pub func test2() {
        return math::add100(1);
      }
    `;
    const { exports, wat } = await compileToWasmModule(code);
    expect((exports as any).test1()).toBe(3);
    expect((exports as any).test2()).toBe(101);
    expect(wat).toMatchSnapshot();
  });
});

describe('importing modules from other files', () => {
  const files: { [path: string]: string } = {
    './path/to/file.snx': `
      pub func doSomething() {
        return 34;
      }
    `,
    'a.snx': `
      import b from "b.snx"
      func funcInA() {
        return 'a';
      }
    `,
    'b.snx': `
      import c from "c.snx"
      func funcInB() {
        return 'b';
      }
    `,
    'c.snx': `
      import a from "a.snx"
      func funcInC() {
        return a::funcInA() + 1;
      }
    `,
    'd.snx': `import a from "a.snx"`,
  };

  const importResolver = async (path: string) => {
    const content = files[path];
    const ast = SNAXParser.parseStrOrThrow(content, 'start', {
      grammarSource: path,
    });
    if (isFile(ast)) {
      return { ast, canonicalUrl: path };
    }
    throw new Error(`Expected file ${path} to parse to a File ast`);
  };

  it('lets you import other files', async () => {
    const code = `
      import someModule from "./path/to/file.snx"
      someModule::doSomething();
    `;
    const { wat } = await compileToWasmModule(code, { importResolver });
    expect(wat).toMatchSnapshot();
  });

  it('only compiles a module once when imported multiple itmes', async () => {
    const code = `
    import first from "./path/to/file.snx"
    import second from "./path/to/file.snx"
    first::doSomething();
    second::doSomething();
  `;
    const { wat } = await compileToWasmModule(code, { importResolver });
    expect(wat).toMatchSnapshot();
  });

  it('does allows circular dependencies, resolving each once', async () => {
    const code = `import someModule from "d.snx"`;
    const { wat } = await compileToWasmModule(code, { importResolver });
    expect(wat).toMatchSnapshot();
  });
});

describe('bugs that came up', () => {
  it('infers types in the right order across functions', async () => {
    const code = `
      func run() {
        let input = read(100);
      }
      import string from "snax/string.snx"
      func read(numBytes:i32) {
        let s = string::String::{buffer: $heap_start(), length: numBytes};
        return s;
      }
    `;
    const { exports } = await compileToWasmModule(code, {
      includeRuntime: true,
    });
  });

  it('compiles functions that return floats', async () => {
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

  it("doesn't run while loops that are false", async () => {
    const code = `
      reg i = 32;
      while (false) {
        i = i + 1;
      }
      i;
    `;
    expect(await exec(code)).toBe(32);
  });
});
