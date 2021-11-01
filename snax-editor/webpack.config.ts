import { resolve } from 'path';
import { getWebpackDevServerConfig } from 'codemirror-blocks/lib/toolkit';
import HtmlWebpackPlugin from 'html-webpack-plugin';

const config = getWebpackDevServerConfig({
  context: resolve('dev-site'),
  entry: './index.tsx',
});

config.resolve = {
  ...config.resolve,
  fallback: {
    ...config.resolve?.fallback,
    path: require.resolve('path-browserify'),
    crypto: require.resolve('crypto-browserify'),
    stream: require.resolve('stream-browserify'),
    fs: false,
  },
};

config.plugins = [
  new HtmlWebpackPlugin({
    templateContent: `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
      </head>
      <body>
      </body>
    </html>
  `,
  }),
];

export default [config];
