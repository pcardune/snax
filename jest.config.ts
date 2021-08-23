/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */
import type { InitialOptionsTsJest } from 'ts-jest/dist/types';

const config: InitialOptionsTsJest = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/projects/**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        // include DOM for access too WebAssembly global
        lib: ['DOM', 'ES2021'],
      },
    },
  },
};

export default config;
