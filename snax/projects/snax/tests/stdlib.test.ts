import { WASI } from '../wasi.js';
import { compileToWasmModule, exec, int32, int32Slice } from './test-util.js';

describe('malloc', () => {
  it('allocates from the beginning of memory', async () => {
    const code = `
      import mem from "snax/memory.snx"
      let start = "static content";
      let x = mem::malloc(7_u32);
      let y = mem::malloc(4_u32);
      y;
    `;
    const startAddress = 'static content'.length + 7;
    expect(await exec(code, { includeRuntime: true })).toEqual(startAddress);
  });

  it('finds the next available space', async () => {
    const code = `
      import mem from "snax/memory.snx"
      pub func test(numBytes:usize) {
        return mem::allocate_memory(numBytes);
      }
      pub func init() {
        mem::init_allocator(100_u32);
      }
    `;
    const { exports, wat } = await compileToWasmModule<{
      init: () => void;
      test: (num: number) => number;
    }>(code, {
      includeRuntime: true,
    });
    exports.init();
    expect(int32(exports.memory, 0)).toEqual(100);
    expect(exports.test(4)).toEqual(8);
    expect(int32(exports.memory, 0)).toEqual(4);
    expect(int32(exports.memory, 4)).toEqual(1);
    expect(int32Slice(exports.memory, 0, 16)).toMatchInlineSnapshot(`
      Array [
        4,
        1,
        0,
        88,
      ]
    `);
    expect(int32(exports.memory, 8 + 4)).toEqual(100 - 12);
    expect(exports.test(8)).toEqual(20);
    expect(int32Slice(exports.memory, 0, 32)).toMatchInlineSnapshot(`
      Array [
        4,
        1,
        0,
        8,
        1,
        0,
        0,
        72,
      ]
    `);
  });
});

describe('sin_f32', () => {
  it('calculated sin', async () => {
    const code = `
      import math from "snax/math.snx"
      math::sinf32(2.0);
    `;
    expect(await exec(code, { includeRuntime: true })).toBeCloseTo(Math.sin(2));
  });
});

describe('io', () => {
  it('lets you print a string', async () => {
    const code = `
      import io from "snax/io.snx"
      io::printStr(@"foo");
    `;
    const wasi = new WASI();
    wasi.stdout.write = jest.fn();
    const { instance } = await compileToWasmModule(code, {
      includeRuntime: true,
      importObject: {
        wasi_snapshot_preview1: wasi.wasiImport,
        wasi_unstable: wasi.wasiImport,
      },
    });
    wasi.start(instance);
    expect(wasi.stdout.write).toHaveBeenCalledWith('foo');
  });
});
