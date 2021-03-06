import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { compileFile } from './cli.js';

(async () => {
  const args = await yargs(hideBin(process.argv)).option('grammar', {
    type: 'string',
    description: 'path to the grammar file that should be compiled',
    demandOption: true,
  }).argv;

  compileFile(args.grammar);
})();
