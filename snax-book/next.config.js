/* eslint-disable @typescript-eslint/no-var-requires */
/** @type {import('next').NextConfig} */
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const ResolveTypeScriptPlugin = require('resolve-typescript-plugin').default;

const withMDX = require('@next/mdx')({
  extension: /\.mdx$/,
});

module.exports = withMDX({
  output: 'export',
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  reactStrictMode: true,
  experimental: { esmExternals: true },
  basePath: '/snax',
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Important: return the modified config
    config.plugins.push(new NodePolyfillPlugin());
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /fs/ }));
    config.resolve.plugins.push(new ResolveTypeScriptPlugin());
    config.module.rules.push({
      test: /\.grammar?$/,
      type: 'asset/source',
    });

    return config;
  },
});
