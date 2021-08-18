import fs from 'fs';
import path from 'path';
import * as debug from '../utils/debug';
import { charCodes, Iter } from '../utils/iter';
import {
  compileGrammarToTypescript,
  compileLexerToTypescript,
  lexer,
  parser,
} from './dsl';

const { colors } = debug;

export function compileFile(grammarFilePath: string) {
  const tokens = lexer.parse(
    charCodes(fs.readFileSync(grammarFilePath, { encoding: 'utf-8' }))
  );
  const root = parser.parseTokensOrThrow(tokens);
  if (!root) {
    console.log('Failed to parse', grammarFilePath);
    return;
  }
  const inPath = path.parse(grammarFilePath);
  const outPath = path.format({
    dir: inPath.dir,
    name: inPath.name + '.__generated__',
    ext: '.ts',
  });
  console.log('Compiling to', outPath);
  const output = compileLexerToTypescript(root);
  debug.log(colors.yellow(output));

  console.log('Compiling grammar to', outPath);
  const grammarOut = compileGrammarToTypescript(root);
  debug.log(colors.yellow(grammarOut));

  fs.writeFileSync(outPath, output + grammarOut);
  console.log(colors.bold(colors.green('✓')), 'Successfully wrote', outPath);
}
