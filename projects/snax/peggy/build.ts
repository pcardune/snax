import fs from 'fs';
import path from 'path';
import * as peggy from 'peggy';

const tspegjs = require('ts-pegjs');
const grammar = fs.readFileSync(path.join(__dirname, 'snax.peggy')).toString();

fs.writeFileSync(
  path.join(__dirname, 'snax.ts'),
  peggy.generate(grammar, {
    output: 'source',
    format: 'commonjs',
    plugins: [tspegjs],
    cache: true,
    allowedStartRules: ['start', 'expr', 'statement'],
  })
);

// fs.writeFileSync(
//   path.join(__dirname, 'snax.js'),
//   peggy.generate(grammar, {
//     output: 'source',
//     format: 'commonjs',
//     plugins: [],
//     cache: true,
//     allowedStartRules: ['start', 'expr', 'statement'],
//   })
// );
