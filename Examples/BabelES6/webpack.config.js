'use strict';

var fs = require('fs');
var path = require('path');
var webpack = require('webpack');

var config = {

  debug: true,

  devtool: 'source-map',

  entry: {
    'index.ios': ['./src/main.js'],
    'index.android': ['./src/main.js'],
  },

  output: {
    path: path.resolve(__dirname, 'build'),
    filename: '[name].js',
  },
  /*externals:{...}*/
  /*这里还有个external参数，主要用来排除rn本身库的引用**/
  module: {
    loaders: [{
      test: /\.js$/,
      include: [
        path.resolve(__dirname, 'src'),
        path.resolve(__dirname, 'node_modules/react-native/Libraries/react-native'),
        path.resolve(__dirname, 'node_modules/react-native-navbar'),
      ],
      loader: 'babel',
      query: {
		plugins:[],
        presets: ['es2015', 'stage-1', 'react'],
      },
    }]
  },

  plugins: [
  ],

};

 
// Hot loader
if (process.env.HOT) {
  config.devtool = 'eval'; // Speed up incremental builds
  config.entry['index.ios'].unshift('react-native-webpack-server/hot/entry');
  config.entry['index.ios'].unshift('webpack/hot/only-dev-server');
  config.entry['index.ios'].unshift('webpack-dev-server/client?http://localhost:8082');
  config.output.publicPath = 'http://localhost:8082/';
  config.plugins.unshift(new webpack.HotModuleReplacementPlugin());
  config.module.loaders[0].query.plugins[0]=[
        'react-transform',{
        transforms: [
            {
              transform: 'react-transform-hmr',
              imports: ['react-native'],
              locals: ['module'],
            }]
        }
  ];
  /* config.module.loaders[0].query.extra = {
    'react-transform': {
      transforms: [{
        transform: 'react-transform-hmr',
        imports: ['react-native'],
        locals: ['module']
      }]
    }
  };*/


}

// Production config
if (process.env.NODE_ENV === 'production') {
  config.plugins.push(new webpack.optimize.OccurrenceOrderPlugin());
  config.plugins.push(new webpack.optimize.UglifyJsPlugin());
}

module.exports = config;
