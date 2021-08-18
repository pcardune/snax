import fs from 'fs';
import path from 'path';
import { charCodes, Iter } from '../utils/iter';
import { compileLexerToTypescript, lexer, parser } from './dsl';

export function compileFile(grammarFilePath: string) {
  const tokens = lexer.parse(
    charCodes(fs.readFileSync(grammarFilePath, { encoding: 'utf-8' }))
  );
  const root = parser.parseTokens(tokens);
  if (!root) {
    console.log('Failed to tokenize', grammarFilePath);
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
  fs.writeFileSync(outPath, output);
}
