module.exports = {
  projects: [
    {
      displayName: 'snax',
      preset: 'ts-jest/presets/default-esm',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/snax/projects/**/*.test.ts'],
      transform: {},
      extensionsToTreatAsEsm: ['.ts'],
      resolver: 'jest-ts-webcompat-resolver',
      globals: {
        'ts-jest': {
          supportStaticESM: true,
          useESM: true,
          tsconfig: {
            // include DOM for access too WebAssembly global
            lib: ['DOM', 'ES2021'],
            esModuleInterop: true,
            module: 'ES2020',
            moduleResolution: 'Node',
          },
        },
      },
    },
  ],
};
