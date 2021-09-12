import { err, ok, Result } from 'neverthrow';
import type * as spec from './spec-gen.js';
import { SNAXParser } from './snax-parser.js';
import * as ASTCompiler from './ast-compiler.js';
import { isFile } from './spec-gen.js';

export interface HasWAT {
  toWAT(): string;
}

export function compileStr(
  input: string,
  options?: ASTCompiler.ModuleCompilerOptions
): Result<string, any> {
  const maybeAST = SNAXParser.parseStr(input);
  if (maybeAST.isOk()) {
    const ast = maybeAST.value;
    if (!isFile(ast)) {
      return err(new Error('parsed input did not yield a file...'));
    }
    try {
      return ok(compileAST(ast, options));
    } catch (e) {
      return err(e);
    }
  } else {
    return err(maybeAST.error);
  }
}

export function compileAST(
  file: spec.File,
  options?: ASTCompiler.ModuleCompilerOptions
): string {
  return new ASTCompiler.ModuleCompiler(file, options).compile().toWAT();
}
