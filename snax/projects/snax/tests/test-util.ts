import * as spec from '../spec-gen.js';
import {
  type CompilesToIR,
  ExprCompiler,
  StmtCompiler,
  FileCompiler,
  type ModuleCompilerOptions,
  type Runtime,
  WASM_FEATURE_FLAGS,
} from '../ast-compiler.js';
import { SNAXParser } from '../snax-parser.js';
import {
  AllocationMap,
  Area,
  type FuncAllocations,
} from '../memory-resolution.js';
import { resolveSymbols } from '../symbol-resolution.js';
import { resolveTypes } from '../type-resolution.js';
import { NumberType } from '../numbers';
import binaryen from 'binaryen';
import { CompilerError, TypeResolutionError } from '../errors.js';
import { dumpASTData } from '../spec-util.js';
import { getNodePathLoader } from '../node-path-loader.js';
import path from 'path';

export type CompileToWatOptions = Partial<ModuleCompilerOptions> & {
  validate?: boolean;
  debug?: boolean;
  optimize?: undefined | 1 | 2 | 3 | 4 | true;
  importObject?: WebAssembly.Imports;
};
export async function compileToWAT(
  input: string | spec.File,
  options: CompileToWatOptions = {}
) {
  const ast =
    typeof input === 'string' ? SNAXParser.parseStrOrThrow(input) : input;

  if (!spec.isFile(ast)) {
    throw new Error(`parsed to an ast node ${ast}, which isn't a file`);
  }
  const compiler = new FileCompiler(ast, {
    importResolver: getNodePathLoader(
      path.resolve(__dirname, '../../../stdlib/')
    ),
    stackSize: 1,
    ...options,
  });
  let binaryenModule;
  try {
    binaryenModule = await compiler.compile();
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

  if (options.optimize !== undefined) {
    binaryen.setOptimizeLevel(
      typeof options.optimize === 'number' ? options.optimize : 2
    );
    binaryenModule = binaryen.readBinary(binaryenModule.emitBinary());
    binaryenModule.setFeatures(WASM_FEATURE_FLAGS);
    binaryenModule.optimize();
  }

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
    heapStart: 0,
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

/**
 * Get a 32 bit number out of a memory buffer from the given byte offset
 */
export function int32(memory: WebAssembly.Memory, offset: number) {
  if (offset < 0) {
    offset = memory.buffer.byteLength + offset;
  }
  return new Int32Array(memory.buffer.slice(offset, offset + 4))[0];
}

export function int32Slice(
  memory: WebAssembly.Memory,
  offset: number,
  length: number
) {
  return [...new Int32Array(memory.buffer.slice(offset, offset + length))];
}

/**
 * Get an 8 bit number out of a memory buffer from the given byte offset
 */
export function int8(memory: WebAssembly.Memory, offset: number) {
  if (offset < 0) {
    offset = memory.buffer.byteLength + offset;
  }
  return new Int8Array(memory.buffer.slice(offset, offset + 1))[0];
}

export type SnaxExports = {
  memory: WebAssembly.Memory;
  stackPointer: WebAssembly.Global;
  _start: () => any;
};

export async function compileToWasmModule<Exports>(
  input: string,
  options?: CompileToWatOptions
) {
  const { wat, ast, compiler, binary, sourceMap } = await compileToWAT(input, {
    includeRuntime: false,
    stackSize: 1,
    ...options,
  });
  const module = await WebAssembly.instantiate(binary, {
    debug: {
      debug: (...args: unknown[]) => {
        console.log('snax debug:', ...args);
      },
    },
    ...options?.importObject,
  });
  const exports = module.instance.exports;
  return {
    instance: module.instance,
    exports: exports as SnaxExports & Exports,
    wat,
    ast,
    compiler,
    sourceMap,
  };
}

export async function exec(
  input: string,
  options?: Partial<CompileToWatOptions>
) {
  const { exports } = await compileToWasmModule(input, options);
  return exports._start();
}
