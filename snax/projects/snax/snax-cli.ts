import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import { readFile } from 'fs/promises';
import { compileStr } from './wat-compiler.js';
import loadWabt from 'wabt';
import { err, ok } from 'neverthrow';
import path from 'path';
// eslint-disable-next-line import/no-unresolved
import { WASI } from 'wasi';
import { SNAXParser } from './snax-parser.js';
import { parseWat } from './wabt-util.js';

const wasi = new WASI({
  args: process.argv,
  env: process.env,
  preopens: {
    '/sandbox': process.cwd(),
  },
});

async function compileSnaxFile(file: string) {
  const source = fs.readFileSync(file).toString();
  const maybeWAT = compileStr(source, {
    includeRuntime: true,
    includeWASI: true,
  });
  if (maybeWAT.isOk()) {
    const wat = maybeWAT.value;
    const wasmModule = await parseWat('', wat);
    wasmModule.validate();
    return ok(wasmModule);
  } else {
    return err(maybeWAT.error);
  }
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
      const maybeModule = await compileSnaxFile(inPath);
      if (opts.verbose) console.timeEnd(label);
      if (maybeModule.isOk()) {
        const result = maybeModule.value.toBinary({
          write_debug_names: true,
        });
        return await WebAssembly.compile(result.buffer);
      } else {
        throw maybeModule.error;
      }
    }
    case '.wasm': {
      return await WebAssembly.compile(await readFile(inPath));
    }
    case '.wat': {
      const wasmModule = await parseWat('', await readFile(inPath));
      wasmModule.validate();
      const result = wasmModule.toBinary({ write_debug_names: true });
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
    });
}

const parser = yargs(hideBin(process.argv))
  .command({
    command: 'parse <file>',
    describe: 'parse a snax file without compiling it',
    builder,
    handler: async (args) => {
      const inPath = args.file;
      const source = fs.readFileSync(inPath).toString();
      const ast = SNAXParser.parseStrOrThrow(source);
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
      const maybeModule = await compileSnaxFile(inPath);
      if (maybeModule.isOk()) {
        const result = maybeModule.value.toBinary({ write_debug_names: true });
        fs.writeFileSync(fileWithExtension(inPath, '.wasm'), result.buffer);
        fs.writeFileSync(
          fileWithExtension(inPath, '.wat'),
          maybeModule.value.toText({})
        );
      } else {
        console.error(maybeModule.error);
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
