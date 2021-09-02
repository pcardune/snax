import { err, ok, Result } from 'neverthrow';
import * as AST from './snax-ast';
import { SNAXParser } from './snax-parser';
import * as ASTCompiler from './ast-compiler';

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
    if (!(ast instanceof AST.File)) {
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
  file: AST.File,
  options?: ASTCompiler.ModuleCompilerOptions
): string {
  return new ASTCompiler.ModuleCompiler(file, options).compile().toWAT();
}
