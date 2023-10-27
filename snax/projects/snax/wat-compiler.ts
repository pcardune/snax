import { err, ok, Result } from 'neverthrow';
import type * as spec from './spec-gen.js';
import { SNAXParser } from './snax-parser.js';
import * as ASTCompiler from './ast-compiler.js';
import { isFile } from './spec-gen.js';
import type binaryen from 'binaryen';

export interface HasWAT {
  toWAT(): string;
}

export async function compileStr(
  input: string,
  options: ASTCompiler.ModuleCompilerOptions
): Promise<Result<binaryen.Module, any>> {
  const maybeAST = SNAXParser.parseStr(input);
  if (maybeAST.isOk()) {
    const ast = maybeAST.value.rootNode;
    if (!isFile(ast)) {
      return err(new Error('parsed input did not yield a file...'));
    }
    try {
      const { binaryenModule: module } = await compileAST(ast, options);
      return ok(module);
    } catch (e) {
      return err(e);
    }
  } else {
    return err(maybeAST.error);
  }
}

export async function compileAST(
  file: spec.File,
  options: ASTCompiler.ModuleCompilerOptions
) {
  const compiler = new ASTCompiler.FileCompiler(file, options);
  const binaryenModule = await compiler.compile();
  return { compiler, binaryenModule };
}
