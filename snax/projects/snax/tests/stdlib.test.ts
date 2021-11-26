import { WASI } from '../wasi.js';
import {
  compileToWasmModule,
  CompileToWatOptions,
  exec,
  int32,
  int32Slice,
} from './test-util.js';

let wasi: WASI;
let options: CompileToWatOptions;

const execWithWASI = async (code: string) => {
  const { instance } = await compileToWasmModule(code, {
    includeRuntime: true,
    importObject: {
      wasi_snapshot_preview1: wasi.wasiImport,
      wasi_unstable: wasi.wasiImport,
    },
  });
  return wasi.start(instance);
};

beforeEach(() => {
  wasi = new WASI();
  wasi.stdout.write = jest.fn();
  options = {
    includeRuntime: true,
    importObject: {
      wasi_snapshot_preview1: wasi.wasiImport,
      wasi_unstable: wasi.wasiImport,
    },
  };
});

describe('malloc', () => {
  it('allocates from the beginning of memory', async () => {
    const code = `
      import mem from "snax/memory.snx"
      pub func test(numBytes:usize) {
        return mem::malloc(numBytes);
      }
    `;
    const { exports } = await compileToWasmModule<{
      test: (numBytes: number) => number;
    }>(code, options);
    const first = exports.test(7);
    const second = exports.test(4);
    const third = exports.test(8);
    expect(second).toBe(first + 7);
    expect(third).toBe(second + 4);
  });

  it('finds the next available space', async () => {
    const code = `
      import mem from "snax/memory.snx"
      pub func test(numBytes:usize) {
        return mem::allocate_memory(numBytes);
      }
      pub func init() {
        return mem::init_allocator(100_u32);
      }
    `;
    const { exports, wat } = await compileToWasmModule<{
      init: () => number;
      test: (num: number) => number;
    }>(code, options);
    const heapStart = exports.init();
    expect(int32(exports.memory, heapStart)).toEqual(100);
    expect(exports.test(4)).toEqual(heapStart + 8);
    expect(int32(exports.memory, heapStart)).toEqual(4);
    expect(int32(exports.memory, heapStart + 4)).toEqual(1);
    expect(int32Slice(exports.memory, heapStart, 16)).toMatchInlineSnapshot(`
      Array [
        4,
        1,
        0,
        88,
      ]
    `);
    expect(int32(exports.memory, heapStart + 8 + 4)).toEqual(100 - 12);
    expect(exports.test(8)).toEqual(heapStart + 20);
    expect(int32Slice(exports.memory, heapStart, 32)).toMatchInlineSnapshot(`
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
    expect(await exec(code, options)).toBeCloseTo(Math.sin(2));
  });
});

describe('io', () => {
  it('lets you print a string', async () => {
    const code = `
      import io from "snax/io.snx"
      io::printStr(@"foo");
    `;
    await execWithWASI(code);
    expect(wasi.stdout.write).toHaveBeenCalledWith('foo');
  });
});
