import fs from 'fs';
import path from 'path';
import peggy from 'peggy';
import { URL } from 'url';
const __dirname = new URL('.', import.meta.url).pathname;

import tspegjs from 'ts-pegjs';
const grammar = fs.readFileSync(path.join(__dirname, 'snax.peggy')).toString();

fs.writeFileSync(
  path.join(__dirname, 'snax.ts'),
  peggy.generate(grammar, {
    output: 'source',
    format: 'commonjs',
    plugins: [tspegjs],
    cache: true,
    allowedStartRules: [
      'start',
      'expr',
      'statement',
      'block',
      'funcDecl',
      'structDecl',
      'typeExpr',
    ],
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
