import * as fs from 'fs/promises';
import path from 'path';
import * as AST from './spec-gen.js';
import { SNAXParser } from './snax-parser.js';

let _cachedRoot: string | undefined;
async function getStdRoot(): Promise<string> {
  if (_cachedRoot) {
    return _cachedRoot;
  }
  // this isn't working yet unfortunately...
  // let currentDir = path.parse(new URL(import.meta.url).pathname).dir;
  let currentDir = __dirname;
  do {
    const files = await fs.readdir(currentDir);
    if (files.find((name) => name === 'package.json')) {
      _cachedRoot = path.resolve(currentDir, 'stdlib');
      return _cachedRoot;
    } else {
      currentDir = path.resolve(currentDir, '..');
    }
  } while (path.parse(currentDir).root !== currentDir);
  throw new Error(`Could not locate std root.`);
}

export default async function loadSourcePath(
  sourcePath: string
): Promise<AST.File> {
  if (sourcePath.startsWith('snax/')) {
    sourcePath = path.resolve(await getStdRoot(), sourcePath);
  }
  const source = await fs.readFile(sourcePath, { encoding: 'utf-8' });
  const ast = SNAXParser.parseStrOrThrow(source, 'start', {
    grammarSource: sourcePath,
  });
  if (!AST.isFile(ast)) {
    throw new Error(`invalid parse result, expected a file.`);
  }
  return ast;
}
