import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
// eslint-disable-next-line import/no-unresolved
import { WASI } from 'wasi';
import { SNAXParser } from './snax-parser.js';
import { ModuleCompiler, WASM_FEATURE_FLAGS } from './ast-compiler.js';
import { isFile } from './spec-gen.js';
import binaryen from 'binaryen';
import { dumpASTData } from './spec-util.js';
import { TypeResolutionError } from './errors.js';

const wasi = new WASI({
  args: process.argv,
  env: process.env,
  preopens: {
    '/sandbox': process.cwd(),
  },
});

function parseFile(inPath: string) {
  const source = fs.readFileSync(inPath).toString();
  const ast = SNAXParser.parseStrOrThrow(source, 'start', {
    grammarSource: path.parse(inPath).base,
  });
  if (!isFile(ast)) {
    throw new Error('invalid parse result');
  }
  return ast;
}

function compileSnaxFile(file: string) {
  const ast = parseFile(file);
  const compiler = new ModuleCompiler(ast, { includeRuntime: true });
  let module;
  try {
    module = compiler.compile();
  } catch (e) {
    if (e instanceof TypeResolutionError) {
      console.log(dumpASTData(ast, { typeMap: e.resolver.typeMap }));
    }
    throw e;
  }
  return { module, compiler };
}

function fileWithExtension(file: string, ext: string) {
  let filePath = path.parse(file);
  return path.format({
    dir: filePath.dir,
    name: filePath.name,
    ext,
  });
}

/**
 * Load a wasm module from the given file path, compiling if necessary.
 * Supports the following file extensions: .snx, .wat, .wasm
 *
 * @param inPath The file path to load
 * @param opts options
 * @returns The WebAssembly.Module instance
 */
async function loadWasmModuleFromPath(
  inPath: string,
  opts: { verbose: boolean }
): Promise<WebAssembly.Module> {
  const { ext } = path.parse(inPath);
  switch (ext) {
    case '.snx': {
      const label = `compiling ${inPath}`;
      if (opts.verbose) console.time(label);
      const { module } = compileSnaxFile(inPath);
      if (!module.validate()) {
        throw new Error('validation error');
      }
      if (opts.verbose) console.timeEnd(label);
      const result = module.emitBinary();
      return await WebAssembly.compile(result.buffer);
    }
    case '.wasm': {
      return await WebAssembly.compile(await readFile(inPath));
    }
    case '.wat': {
      const module = binaryen.parseText(
        await readFile(inPath, { encoding: 'utf8' })
      );
      module.setFeatures(WASM_FEATURE_FLAGS);
      module.validate();
      const result = module.emitBinary();
      return await WebAssembly.compile(result.buffer);
    }
  }
  throw new Error(`Unrecognized extension ${ext}`);
}

function builder<T>(yargs: yargs.Argv<T>) {
  return yargs
    .positional('file', {
      alias: 'file',
      describe: 'file to compile',
      type: 'string',
      demandOption: true,
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Run with verbose logging',
      default: false,
    })
    .option('dumpDebugInfo', {
      type: 'boolean',
      description: 'Dump compiler debug information to a file',
      default: false,
    });
}

const parser = yargs(hideBin(process.argv))
  .command({
    command: 'parse <file>',
    describe: 'parse a snax file without compiling it',
    builder,
    handler: async (args) => {
      const inPath = args.file;
      const ast = parseFile(inPath);
      const outPath = fileWithExtension(inPath, '.ast.json');
      fs.writeFileSync(outPath, JSON.stringify(ast));
      console.log(`wrote ${outPath}`);
    },
  })
  .command({
    command: 'compile <file>',
    describe: 'compile a snax file',
    builder,
    handler: async (args) => {
      let inPath = args.file;
      console.log('Compiling file', inPath);
      const { module, compiler } = compileSnaxFile(inPath);
      if (!module.validate()) {
        console.warn('validation error');
      }

      const { binary, sourceMap } = module.emitBinary(
        path.parse(inPath).name + '.wasm.map'
      );

      const writeFile = (path: string, data: string | Uint8Array) => {
        fs.writeFileSync(path, data);
        console.log(`wrote ${path}`);
      };

      if (args.dumpDebugInfo) {
        writeFile(
          fileWithExtension(inPath, '.dump'),
          dumpASTData(compiler.root, {
            symbolTables: compiler.tables,
            typeMap: compiler.typeCache,
          })
        );
      }

      binaryen.setOptimizeLevel(2);
      module.optimize();

      writeFile(fileWithExtension(inPath, '.wat'), module.emitText());
      writeFile(fileWithExtension(inPath, '.wasm'), binary);
      writeFile(fileWithExtension(inPath, '.asm.js'), module.emitAsmjs());
      if (sourceMap) {
        writeFile(fileWithExtension(inPath, '.wasm.map'), sourceMap);
      }
    },
  })
  .command({
    command: 'run <file>',
    describe: 'compile and run a snax file',
    aliases: ['$0'],
    builder,
    handler: async (args) => {
      const inPath = args.file;
      const wasm = await loadWasmModuleFromPath(inPath, args);

      const importObject = {
        wasi_unstable: wasi.wasiImport,
        wasi_snapshot_preview1: wasi.wasiImport,
      };
      const module = await WebAssembly.instantiate(wasm, importObject);
      try {
        const label = `running ${inPath}`;
        if (args.verbose) console.time(label);
        wasi.start(module);
        if (args.verbose) console.timeEnd(label);
      } catch (e) {
        console.error(`error while running ${args.file}`);
        console.error(e);
        return;
      }
    },
  });

(async () => {
  const argv = await parser.argv;
})();
