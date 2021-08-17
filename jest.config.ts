/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */
import type { InitialOptionsTsJest } from 'ts-jest/dist/types';

const config: InitialOptionsTsJest = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/projects/**/*.test.ts'],
};

export default config;
