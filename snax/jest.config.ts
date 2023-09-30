import type { Config } from 'jest';
const config: Config = {
  displayName: 'snax',
  preset: 'ts-jest/presets/default-esm',
  testMatch: ['<rootDir>/projects/**/*.test.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  snapshotFormat: {
    escapeString: true,
    printBasicPrototype: true,
  },
};

export default config;
