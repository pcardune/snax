import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import { compileStr } from './wat-compiler';
import loadWabt from 'wabt';

const parser = yargs(hideBin(process.argv))
  .command({
    command: 'compile',
    describe: 'compile a snax file',
    builder: (yargs) => yargs.option('out', { alias: 'o' }),
    handler: () => {
      console.log("I don't know how to compile yet...");
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
      const file = argv.file as string;
      const source = fs.readFileSync(file).toString();
      const maybeWAT = compileStr(source);
      if (maybeWAT.isOk()) {
        const wat = maybeWAT.value;
        const wabt = await loadWabt();
        const wasmModule = wabt.parseWat('', wat);
        wasmModule.validate();
        const result = wasmModule.toBinary({ write_debug_names: true });
        const module = await WebAssembly.instantiate(result.buffer);
        const exports: any = module.instance.exports;
        console.log(exports.main());
      } else {
        console.error(maybeWAT.error);
      }
    },
  });

(async () => {
  const argv = await parser.argv;
})();
