module.exports = {
  env: {
    browser: true,
    node: true,
    es2021: true,
    'jest/globals': true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 12,
    sourceType: 'module',
  },
  plugins: ['react', '@typescript-eslint', 'import', 'jest'],
  rules: {
    'import/no-cycle': 'error',
    'import/no-named-as-default-member': 'off',
    '@typescript-eslint/no-empty-function': 'off',

    // TODO: See which of these can be turned back on.
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'no-empty': 'off',
    'no-case-declarations': 'off',
    'no-constant-condition': 'off',
    'prefer-const': 'off',
    'getter-return': 'off',
  },
  settings: {
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true, // always try to resolve types under `<root>@types` directory even it doesn't contain any source code, like `@types/unist`

        // // Choose from one of the "project" configs below or omit to use <root>/tsconfig.json by default

        // // use <root>/path/to/folder/tsconfig.json
        // project: 'path/to/folder',

        // // Multiple tsconfigs (Useful for monorepos)

        // // use a glob pattern
        // project: 'packages/*/tsconfig.json',

        // // use an array
        project: ['snax/tsconfig.json', 'snax-book/tsconfig.json'],

        // // use an array of glob patterns
        // project: ['packages/*/tsconfig.json', 'other-packages/*/tsconfig.json'],
      },
    },
  },
};
