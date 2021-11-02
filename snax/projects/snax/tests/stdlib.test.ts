import { compileToWasmModule, exec, SnaxExports } from './test-util.js';

describe('malloc', () => {
  it('allocates from the beginning of memory', async () => {
    const code = `
      import mem from "snax/memory.snx"
      let start = "static content";
      let x = mem::malloc(7);
      let y = mem::malloc(4);
      y;
    `;
    const startAddress = 'static content'.length + 7;
    expect(await exec(code, { includeRuntime: true })).toEqual(startAddress);
  });
});

describe('sin_f32', () => {
  const code = `
    import math from "snax/math.snx"
    pub func calc(x:f32) {
      return math::sinf32(x);
    }
  `;
  let calc: (x: number) => number;

  beforeAll(async () => {
    const { exports } = await compileToWasmModule<
      SnaxExports & { calc: typeof calc }
    >(code);
    calc = exports.calc;
  });

  it('calculates sin', async () => {
    for (let i = -5; i < 5; i += 0.1) {
      expect(calc(i)).toBeCloseTo(Math.sin(i));
    }
  });
});
