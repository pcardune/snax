const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './projects/book/index.tsx',
  devtool: 'inline-source-map',
  mode: 'development',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'nfaExplore',
    clean: true,
  },
  devServer: {
    static: {
      directory: './book/book',
    },
  },
  plugins: [new webpack.IgnorePlugin({ resourceRegExp: /fs/ })],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
};
