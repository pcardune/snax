import * as fs from 'fs/promises';
import path from 'path';
import * as AST from './spec-gen.js';
import { SNAXParser } from './snax-parser.js';

export function getNodePathLoader(stdRoot?: string) {
  if (!stdRoot) {
    stdRoot = process.env.SNAX_STD_ROOT;
  }

  return async function loadSourcePath(sourcePath: string): Promise<AST.File> {
    if (sourcePath.startsWith('snax/')) {
      if (!stdRoot) {
        throw new Error(
          `SNAX_STD_ROOT environment variable not set, can't import snax standard library.`
        );
      }
      sourcePath = path.resolve(stdRoot, sourcePath);
    }
    const source = await fs.readFile(sourcePath, { encoding: 'utf-8' });
    const ast = SNAXParser.parseStrOrThrow(source, 'start', {
      grammarSource: sourcePath,
    });
    if (!AST.isFile(ast)) {
      throw new Error(`invalid parse result, expected a file.`);
    }
    return ast;
  };
}
