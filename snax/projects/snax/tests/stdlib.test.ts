import { exec } from './test-util.js';

describe('malloc', () => {
  it('allocates from the beginning of memory', async () => {
    const code = `
      let start = "static content";
      let x = malloc(7);
      let y = malloc(4);
      y;
    `;
    const startAddress = 'static content'.length + 7;
    expect(await exec(code, { includeRuntime: true })).toEqual(startAddress);
  });
});
