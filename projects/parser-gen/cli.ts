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

export function compileFile(
  grammarFilePath: string,
  importRoot: string = './projects'
) {
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
  const importPath = path.relative(inPath.dir, importRoot);
  const output = compileLexerToTypescript(root, importPath);
  if (output.isErr()) {
    debug.log(colors.red('Failed compiling lexer: ' + output.error));
    return;
  }
  debug.log(colors.yellow(output.value));

  console.log('Compiling grammar to', outPath);
  const grammarOut = compileGrammarToTypescript(root, importPath);
  if (grammarOut.isErr()) {
    debug.log(colors.red('Failed compiling grammar: ' + grammarOut.error));
    return;
  }
  debug.log(colors.yellow(grammarOut.value));

  fs.writeFileSync(outPath, output.value + grammarOut.value);
  console.log(colors.bold(colors.green('✓')), 'Successfully wrote', outPath);
}
