import * as spec from '../spec-gen.js';
import {
  CompilesToIR,
  IRCompiler,
  ModuleCompiler,
  ModuleCompilerOptions,
  Runtime,
} from '../ast-compiler.js';
import { SNAXParser } from '../snax-parser.js';
import type loadWabt from 'wabt';
import { AllocationMap, Area } from '../memory-resolution.js';
import { resolveSymbols } from '../symbol-resolution.js';
import { resolveTypes } from '../type-resolution.js';

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

export const runtimeStub: Runtime = {
  malloc: { area: Area.FUNCS, offset: 1000, id: 'f1000:malloc' },
  stackPointer: { area: Area.GLOBALS, offset: 1000, id: 'g1000:#SP' },
};

export function irCompiler(node: CompilesToIR) {
  const { refMap } = resolveSymbols(node);
  const typeCache = resolveTypes(node, refMap);
  return IRCompiler.forNode(node, {
    refMap,
    typeCache,
    allocationMap: new AllocationMap(),
    runtime: runtimeStub,
  });
}
