import { exec } from './test-util.js';

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
  it('calculated sin', async () => {
    const code = `
      import math from "snax/math.snx"
      math::sinf32(2.0);
    `;
    expect(await exec(code, { includeRuntime: true })).toBeCloseTo(Math.sin(2));
  });
});
