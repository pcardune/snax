#!/usr/bin/env -S node --enable-source-maps --experimental-wasi-unstable-preview1 --no-warnings
if (!process.env.SNAX_STD_ROOT) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');
  process.env.SNAX_STD_ROOT = path.resolve(__dirname, '..', 'stdlib');
}
import('@pcardune/snax/dist/snax/snax-cli.js');
