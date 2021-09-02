import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import { compileStr } from './wat-compiler';
import loadWabt from 'wabt';
import { err, ok } from 'neverthrow';
import path from 'path';

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
    const result = wasmModule.toBinary({ write_debug_names: true });
    return ok(result.buffer);
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
      const maybeBuffer = await compileSnaxFile(file);
      if (maybeBuffer.isOk()) {
        let filePath = path.parse(file);
        let outFile = path.format({
          dir: filePath.dir,
          name: filePath.name,
          ext: '.wasm',
        });
        fs.writeFileSync(outFile, maybeBuffer.value);
      } else {
        console.error(maybeBuffer.error);
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
      const maybeBuffer = await compileSnaxFile(argv.file as string);
      if (maybeBuffer.isOk()) {
        const module = await WebAssembly.instantiate(maybeBuffer.value);
        const exports: any = module.instance.exports;
        console.log(exports._start());
      } else {
        console.error(maybeBuffer.error);
      }
    },
  });

(async () => {
  const argv = await parser.argv;
})();
