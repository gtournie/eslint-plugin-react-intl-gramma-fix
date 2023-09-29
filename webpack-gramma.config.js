const path = require('path')
const webpack = require('webpack')
const StringReplacePlugin = require("string-replace-webpack-plugin");
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: './node_modules/gramma/src/index.js',
  output: {
    path: path.resolve('dist'),
    filename: 'gramma.js',
    libraryTarget: "commonjs",
    globalObject: 'global',
  },
  optimization: {
    minimizer: [new TerserPlugin({
      extractComments: false,
    })],
  },
  plugins: [
    new webpack.DefinePlugin({ fetch: 'grammaFetch' }),
    new StringReplacePlugin()
  ],
  module: {
    rules: [
      {
        test: /\.js$/,
        use: {
          loader: StringReplacePlugin.replace({
            replacements: [{ pattern: /async|await/ig, replacement: () => '' }]
          })
        }
      }
    ]
  }
};
