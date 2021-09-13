import * as spec from '../spec-gen.js';
import { ModuleCompiler, ModuleCompilerOptions } from '../ast-compiler.js';
import { SNAXParser } from '../snax-parser.js';
import type loadWabt from 'wabt';

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;

export type WabtModule = ThenArg<ReturnType<typeof loadWabt>>;

export function makeCompileToWAT(wabt: WabtModule) {
  return (input: string | spec.File, options?: ModuleCompilerOptions) => {
    const ast =
      typeof input === 'string' ? SNAXParser.parseStrOrThrow(input) : input;

    if (!spec.isFile(ast)) {
      throw new Error(`parsed to an ast node ${ast}, which isn't a file`);
    }
    const wat = new ModuleCompiler(ast, options).compile().toWAT();
    const module = wabt.parseWat('', wat);
    module.applyNames();
    return module.toText({ foldExprs: true });
  };
}
