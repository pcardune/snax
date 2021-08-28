import fs from 'fs';
import path from 'path';
import * as peggy from 'peggy';

const tspegjs = require('ts-pegjs');
const grammar = fs.readFileSync(path.join(__dirname, 'snax.peggy')).toString();
// var parser = peggy.generate(grammar, {
//   output: 'source',
//   format: 'commonjs',
//   plugins: [tspegjs],
//   tspegjs: {
//     customHeader: "// import lib\nimport { Lib } from 'mylib';",
//   },
// });

const parser = peggy.generate(grammar, {
  output: 'source',
  format: 'commonjs',
  plugins: [tspegjs],
  cache: true,
  allowedStartRules: ['start', 'expr', 'statement'],
});

fs.writeFileSync(path.join(__dirname, 'snax.ts'), parser);
