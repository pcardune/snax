import type { Config } from 'jest';
const config: Config = {
  displayName: 'snax',
  preset: 'ts-jest/presets/default-esm',
  testMatch: ['<rootDir>/projects/**/*.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '\\.ts$': ['ts-jest', {useESM: true}],
  },
  snapshotFormat: {
    escapeString: true,
    printBasicPrototype: true,
  },
};

export default config;
