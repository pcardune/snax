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
    const wabt = await loadWabt();
    const wasmModule = wabt.parseWat('', wat);
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
      const { ext } = path.parse(inPath);
      const importObject = {
        wasi_unstable: wasi.wasiImport,
        wasi_snapshot_preview1: wasi.wasiImport,
      };
      let wasm: WebAssembly.Module;
      if (ext === '.snx') {
        const label = `compiling ${inPath}`;
        if (args.verbose) console.time(label);
        const maybeModule = await compileSnaxFile(inPath);
        if (args.verbose) console.timeEnd(label);
        if (maybeModule.isOk()) {
          const result = maybeModule.value.toBinary({
            write_debug_names: true,
          });
          wasm = await WebAssembly.compile(result.buffer);
        } else {
          console.error(maybeModule.error);
          return;
        }
      } else if (ext === '.wasm') {
        wasm = await WebAssembly.compile(await readFile(inPath));
      } else {
        console.error(`Unrecognized extension ${ext}`);
        return;
      }

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
