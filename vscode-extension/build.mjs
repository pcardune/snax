import * as esbuild from 'esbuild';

const standardOptions = {
  bundle: true,
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  minify: process.argv.includes('--minify'),
  sourcemap: process.argv.includes('--minify'),
};

const configs = [
  {
    entryPoints: ['client/src/extension.ts'],
    outfile: 'out/main.js',
    ...standardOptions,
  },
  {
    entryPoints: ['server/src/server.ts'],
    outfile: 'server/out/server.js',
    ...standardOptions,
  },
  {
    entryPoints: ['server/server.cjs'],
    outfile: 'server/out/server-entry.js',
    ...standardOptions,
  },
];

if (process.argv.includes('--watch')) {
  const contexts = await Promise.all(
    configs.map((config) => esbuild.context(config))
  );
  console.log('Watching for changes...');
  await Promise.all(contexts.map((context) => context.watch()));
} else {
  await Promise.all(configs.map((config) => esbuild.build(config)));
}
