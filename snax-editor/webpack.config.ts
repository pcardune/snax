import { resolve } from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import type { Configuration } from 'webpack';

const isDevelopment = process.env.NODE_ENV !== 'production';

const devPlugins = [new ReactRefreshWebpackPlugin()];

const config: Configuration = {
  mode: isDevelopment ? 'development' : 'production',
  context: resolve('dev-site'),
  entry: './index.tsx',
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'], // Order matters!
    fallback: {
      // needed for binaryen to load in the browser
      path: require.resolve('path-browserify'),
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      fs: false,
    },
  },
  devServer: {
    hot: true,
  },
  devtool: isDevelopment ? 'eval-source-map' : false,
  module: {
    rules: [
      {
        test: /\.less$|.css$/,
        use: [
          { loader: 'style-loader' },
          { loader: 'css-loader' },
          { loader: 'less-loader' },
        ],
      },
      {
        test: /\.[jt]sx?$/,
        // exclude node_modules except for snax
        exclude: /node_modules\/(?!snax)/,
        use: [
          {
            loader: require.resolve('babel-loader'),
            options: {
              presets: ['@babel/preset-react', '@babel/preset-typescript'],
              plugins: [
                isDevelopment && require.resolve('react-refresh/babel'),
                ['babel-plugin-direct-import', { modules: ['@mui/material'] }],
              ].filter(Boolean),
            },
          },
        ],
      },
    ],
  },
  plugins: [
    ...(isDevelopment ? devPlugins : []),
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
  ],
};

export default config;
