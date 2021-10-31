import type { InitialOptionsTsJest } from 'ts-jest/dist/types';
const config: InitialOptionsTsJest = {
  displayName: 'snax',
  preset: 'ts-jest/presets/default-esm',
  testMatch: ['<rootDir>/snax/projects/**/*.test.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};

export default config;
