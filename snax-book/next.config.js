/** @type {import('next').NextConfig} */
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');

const withMDX = require('@next/mdx')({
  extension: /\.mdx$/,
});

module.exports = withMDX({
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  reactStrictMode: true,
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Important: return the modified config
    config.plugins.push(new NodePolyfillPlugin());
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /fs/ }));

    config.module.rules.push({
      test: /\.grammar?$/,
      type: 'asset/source',
    });

    return config;
  },
});
