import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import { compileStr } from './wat-compiler';
import loadWabt from 'wabt';
import { err, ok } from 'neverthrow';
import path from 'path';
import { WASI } from 'wasi';

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

const parser = yargs(hideBin(process.argv))
  .command({
    command: 'compile <file>',
    describe: 'compile a snax file',
    builder: (yargs) =>
      yargs.positional('file', {
        alias: 'file',
        describe: 'file to compile',
        type: 'string',
      }),
    handler: async (argv) => {
      let file = argv.file as string;
      console.log('Compiling file', file);
      const maybeModule = await compileSnaxFile(file);
      if (maybeModule.isOk()) {
        let filePath = path.parse(file);
        const result = maybeModule.value.toBinary({ write_debug_names: true });
        fs.writeFileSync(
          path.format({
            dir: filePath.dir,
            name: filePath.name,
            ext: '.wasm',
          }),
          result.buffer
        );
        fs.writeFileSync(
          path.format({
            dir: filePath.dir,
            name: filePath.name,
            ext: '.wat',
          }),
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
    builder: (yargs) =>
      yargs.positional('file', {
        alias: 'file',
        describe: 'file to run',
        type: 'string',
      }),
    handler: async (argv) => {
      const maybeModule = await compileSnaxFile(argv.file as string);
      if (maybeModule.isOk()) {
        const result = maybeModule.value.toBinary({ write_debug_names: true });
        const importObject = { wasi_unstable: wasi.wasiImport };
        const wasm = await WebAssembly.compile(result.buffer);
        const module = await WebAssembly.instantiate(wasm, importObject);
        wasi.start(module);
        // const exports: any = module.instance.exports;
        // console.log(exports._start());
      } else {
        console.error(maybeModule.error);
      }
    },
  });

(async () => {
  const argv = await parser.argv;
})();
