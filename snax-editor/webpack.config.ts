import { resolve } from 'path';
import { getWebpackDevServerConfig } from 'codemirror-blocks/lib/toolkit';

export default [
  getWebpackDevServerConfig({
    context: resolve('dev-site'),
    entry: './index.ts',
  }),
];
