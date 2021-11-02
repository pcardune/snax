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

describe('trigonometric functions', () => {
  const code = `
    import math from "snax/math.snx"
    pub func sin(x:f32) {
      return math::sinf32(x);
    }
    pub func cos(x:f32) {
      return math::cosf32(x);
    }
  `;

  type TrigFunc = (x: number) => number;
  let calc: { sin: TrigFunc; cos: TrigFunc };

  beforeAll(async () => {
    const { exports } = await compileToWasmModule<SnaxExports & typeof calc>(
      code
    );
    calc = exports;
  });

  it('sinf32()', async () => {
    for (let i = -5; i < 5; i += 0.1) {
      expect(calc.sin(i)).toBeCloseTo(Math.sin(i));
    }
  });

  it('cosf32()', async () => {
    for (let i = -5; i < 5; i += 0.1) {
      expect(calc.cos(i)).toBeCloseTo(Math.cos(i));
    }
  });
});
