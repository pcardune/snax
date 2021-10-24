import * as spec from '../spec-gen.js';
import {
  CompilesToIR,
  ExprCompiler,
  StmtCompiler,
  ModuleCompiler,
  ModuleCompilerOptions,
  Runtime,
} from '../ast-compiler.js';
import { SNAXParser } from '../snax-parser.js';
import { AllocationMap, Area, FuncAllocations } from '../memory-resolution.js';
import { resolveSymbols } from '../symbol-resolution.js';
import { resolveTypes } from '../type-resolution.js';
import { NumberType } from '../numbers';
import binaryen from 'binaryen';
import { FuncType, Intrinsics } from '../snax-types.js';
import { CompilerError, TypeResolutionError } from '../errors.js';
import { dumpASTData } from '../spec-util.js';

export type CompileToWatOptions = ModuleCompilerOptions & {
  validate?: boolean;
  debug?: boolean;
};
export function compileToWAT(
  input: string | spec.File,
  options: CompileToWatOptions = {}
) {
  const ast =
    typeof input === 'string' ? SNAXParser.parseStrOrThrow(input) : input;

  if (!spec.isFile(ast)) {
    throw new Error(`parsed to an ast node ${ast}, which isn't a file`);
  }
  const compiler = new ModuleCompiler(ast, { stackSize: 1, ...options });
  let binaryenModule;
  try {
    binaryenModule = compiler.compile();
  } catch (e) {
    if (e instanceof CompilerError) {
      e.attachModuleCompiler(compiler);
      if (typeof input === 'string') {
        e.attachSource(input);
      }
    }
    if (options.debug) {
      if (e instanceof TypeResolutionError) {
        console.log(dumpASTData(ast, { typeMap: e.resolver.typeMap }));
      } else {
        console.log(
          dumpASTData(ast, {
            symbolTables: compiler.tables,
            typeMap: compiler.typeCache,
          })
        );
      }
    }
    throw e;
  }

  const oldWarn = console.warn;
  const warnings: string[] = [];
  global.console.warn = (...args) => {
    warnings.push(args.join(' '));
  };
  if (!binaryenModule.validate()) {
    if (options.validate ?? true) {
      throw new Error(`Failed validation: ${warnings.join('\n')}`);
    }
  }
  global.console.warn = oldWarn;

  let wat = binaryenModule.emitText();
  const { sourceMap, binary } = binaryenModule.emitBinary('module.wasm.map');
  binaryenModule.dispose();
  return {
    wat,
    ast,
    compiler,
    binary,
    sourceMap,
  };
}

export const runtimeStub: Runtime = {
  malloc: {
    area: Area.FUNCS,
    offset: 1000,
    id: 'f1000:malloc',
    funcType: new FuncType([], Intrinsics.i32),
  },
  stackPointer: {
    area: Area.GLOBALS,
    offset: 1000,
    id: 'g1000:#SP',
    valueType: NumberType.i32,
  },
};

function stubContext(node: CompilesToIR) {
  const { refMap } = resolveSymbols(node);
  const typeCache = resolveTypes(node, refMap);
  return {
    refMap,
    typeCache,
    allocationMap: new AllocationMap(),
    runtime: runtimeStub,
    get funcAllocs(): FuncAllocations {
      throw new Error(`test-util context stuff doesn't support arp yet`);
    },
    setDebugLocation: () => {},
    module: new binaryen.Module(),
  };
}

export function irCompiler(node: CompilesToIR) {
  return StmtCompiler.forNode(node, stubContext(node));
}

export function exprCompiler(node: spec.Expression) {
  return ExprCompiler.forNode(node, stubContext(node));
}
