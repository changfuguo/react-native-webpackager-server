'use strict';

const Promise = require('bluebird');

const fs = Promise.promisifyAll(require('fs'));
const path = require('path');
const url = require('url');
const express = require('express');
const spawn = require('child_process').spawn;
const mkdirp = Promise.promisifyAll(require('mkdirp'));
const semver = require('semver');
const SourceNode = require('source-map').SourceNode;
const SourceMapConsumer = require('source-map').SourceMapConsumer;
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const waitForSocket = require('socket-retry-connect').waitForSocket;
const fetch = require('./fetch');

const ENTRY_JS = 'global.React = require("react-native");';
const SOURCEMAP_REGEX = /\/\/[#@] sourceMappingURL=([^\s'"]*)/;

const makeExternals = require('../packager/lib/makeExternals');

function staticImageTransform(context, request, callback) {
  if (/^image!/.test(request)) {
    return callback(null, JSON.stringify({
      uri: request.replace('image!', ''),
      isStatic: true,
    }));
  }
  callback();
}
function md5(content){
  var crypto = require('crypto');
  var md5 = crypto.createHash('md5');
  md5.update(content);
  return md5.digest('hex');
}
function makeHotConfig(webpackConfig) {
  webpackConfig.plugins = webpackConfig.plugins || [];
  webpackConfig.plugins.unshift(
    new webpack.BannerPlugin(
      'if (typeof navigator.userAgent === \'undefined\') {\n' +
      '  throw new Error(\'Hot module replacement only works with RCTWebSocketExecutor; use Cmd + D, "Debug in Chrome"\')' +
      '}\n',
      {raw: true, entryOnly: true}
    )
  );
}

class Server {

  /**
   * Create a new server with the following options:
   * @param {String}  hostname
   * @param {Number}  port
   * @param {Number}  packagerPort
   * @param {Number}  webpackPort
   * @param {Boolean} android       Enable Android support
   * @param {Boolean} ios           Enable iOS support
   * @param {String}  androidEntry
   * @param {String}  iosEntry
   * @param {Object}  webpackConfig The webpack config to use for webpack-dev-server
   * @param {Boolean} hot           Enable hot module replacement
   *
   * @constructor
   * @param {Object} options
   */
  constructor(options) {
    this.hostname = options.hostname;
    this.port = options.port;
    this.packagerPort = options.packagerPort;
    this.webpackPort = options.webpackPort;
    this.entries = {
      android: options.androidEntry,
      ios: options.iosEntry,
    };
    this.platforms = options.platforms;
    this.projectRoots = options.projectRoots;
    this.assetRoots = options.assetRoots;
    this.resetCache = !!options.resetCache;
    this.hot = !!options.hot;
    this.webpackConfig = options.webpackConfig;

    this.dev = !!options.dev;

    this.makerExt = new makeExternals({
        projectRoots :options.projectRoots,
        assetRoots :options.assetRoots,
        dev: this.dev
    })
    // Check for local react-native.
    try {
      require.resolve('react-native');
    } catch (err) {
      throw new Error('Could not find react-native. Try `npm install react-native`.');
    }

    // Construct resource URLs up-front
    this.webpackBaseURL = url.format({
      protocol: 'http',
      hostname: this.hostname,
      port: this.webpackPort,
    });
    this.packagerBaseURL = url.format({
      protocol: 'http',
      hostname: this.hostname,
      port: this.packagerPort,
    });
  }

  start() {
    // Create a stub entry module for the RN packager.
    ///Users/baidu/projects/react-native-webpack-server/Examples/BabelES6/node_modules/react-native-webpack-server/_entry

    this.entryDir = path.resolve(__dirname, '../packager/entry');
    //return this._writeEntryFiles().then(() => {
      // Re-throw error if server fails to handle a promise rejection
      process.on('unhandledRejection', reason => {
        throw reason;
      });

      // Make sure to clean up when the process is terminated.
      process.on('exit', () => this.handleProcessExit());
      process.on('SIGINT', () => {
        this.handleProcessExit();
        process.exit(1);
      });

      // Construct a promise waiting for both servers to fully start...
      const readyPromise = this._startWebpackDevServer().then(() =>
        // We need to start this one second to prevent races between the bundlers.
        this._startPackageServer()
      );

      // Setup the express server
      this.server = express();
      this.server.use((req, res, next) => {
        // Wait until packager has started before serving requests
        readyPromise
          .then(() => next())
          .catch(err => next(err));
      });
      this.server.get('/*.bundle', this.handleBundleRequest.bind(this));
      this.server.get('/*.map', this.handleMapRequest.bind(this));
      this.server.use((err, req, res, next) => {
        console.error(err.stack);
        next(err);
      });

      const listenPromise = new Promise(resolve => {
        this.httpServer = this.server.listen(this.port, () => {
          console.log(`Server listening at http://${this.hostname}:${this.port}`);
          resolve();
        });
        // Disable any kind of automatic timeout behavior on incoming connections.
        this.httpServer.timeout = 0;
      });
      return Promise.all([listenPromise, readyPromise]);
    //});
  }

  stop() {
    this.handleProcessExit();
    this.httpServer && this.httpServer.close();
    this.webpackServer && this.webpackServer.close();
  }

  handleBundleRequest(req, res, next) {
    const parsedUrl = url.parse(req.url, /* parse query */ true);
    const urlSearch = parsedUrl.search;
    const platform = parsedUrl.query.platform;

    // Forward URL params to RN packager
    const reactCodeURL = this._getReactCodeURL(platform) + urlSearch;
    const appCodeURL = this._getAppCodeURL(platform);
    //console.log(reactCodeURL,' ' ,appCodeURL);
    //reactCodeURL:  http://localhost:8081/index.ios.bundle?platform=ios&dev=false&minify=false   
    //appCodeURL: http://localhost:8082/index.ios.js
    Promise.props({
      reactCode: fetch(reactCodeURL),
      appCode: fetch(appCodeURL),
    }).then(r =>
      this._createBundleCode(r.reactCode, r.appCode, urlSearch, platform)
    ).then(bundleCode => {
      res.set('Content-Type', 'application/javascript');
      res.send(bundleCode);
    }).catch(err => next(err));
  }

  handleMapRequest(req, res, next) {
    const parsedUrl = url.parse(req.url, /* parse query */ true);
    const urlSearch = parsedUrl.search;
    const platform = parsedUrl.query.platform;

    // Forward URL params to RN packager
    const reactCodeURL = this._getReactCodeURL(platform) + urlSearch;
    const reactMapURL = this._getReactMapURL(platform) + urlSearch;
    const appCodeURL = this._getAppCodeURL(platform);
    const appMapURL = this._getAppMapURL(platform);

    Promise.props({
      reactCode: fetch(reactCodeURL),
      reactMap: fetch(reactMapURL),
      appCode: fetch(appCodeURL),
      appMap: fetch(appMapURL),
    }).then(r =>
      this._createBundleMap(r.reactCode, r.reactMap, r.appCode, r.appMap)
    ).then(bundleMap => {
      res.set('Content-Type', 'application/json');
      res.send(bundleMap);
    }).catch(err => next(err));
  }

  handleProcessExit() {
    // Clean up temp files
    const entryDir = this.entryDir;

    if (fs.existsSync(entryDir)) {
      fs.readdirSync(entryDir).forEach(file => {
        fs.unlinkSync(path.join(entryDir, file));
      });
      fs.rmdirSync(entryDir);
    }

    // Kill the package server
    if (this.packageServer) {
      this.packageServer.kill();
    }
  }

  _getReactCodeURL(platform) {
    return url.resolve(this.packagerBaseURL, `index.${platform}.bundle`);
  }

  _getReactMapURL(platform) {
    return url.resolve(this.packagerBaseURL, `index.${platform}.map`);
  }

  _getAppCodeURL(platform) {
    return url.resolve(this.webpackBaseURL, `${this.entries[platform]}.js`);
  }

  _getAppMapURL(platform) {
    return url.resolve(this.webpackBaseURL, `${this.entries[platform]}.js.map`);
  }

  _createBundleCode(reactCode, appCode, urlSearch, platform) {
    reactCode = reactCode.replace(SOURCEMAP_REGEX, '');
    console.log('reactCode md5:' + md5(reactCode));
    console.log('appCode md5:' + md5(appCode));
    appCode = appCode.replace(SOURCEMAP_REGEX, '');
    return reactCode + appCode + `//# sourceMappingURL=/${this.entries[platform]}.map${urlSearch}`;
  }

  _createBundleMap(reactCode, reactMap, appCode, appMap) {
    const node = new SourceNode();

    node.add(SourceNode.fromStringWithSourceMap(
      reactCode,
      new SourceMapConsumer(reactMap)
    ));
    node.add(SourceNode.fromStringWithSourceMap(
      appCode,
      new SourceMapConsumer(appMap)
    ));

    return node.join('').toStringWithSourceMap().map.toString();
  }

  _writeEntryFiles() {
    const source = ENTRY_JS + '\n';
    return mkdirp.mkdirpAsync(this.entryDir).then(() => Promise.all([
      fs.writeFileAsync(path.resolve(this.entryDir, 'index.android.js'), source, 'utf8'),
      fs.writeFileAsync(path.resolve(this.entryDir, 'index.ios.js'), source, 'utf8'),
    ]));
  }

  _startPackageServer() {
    /**
     * Starting the server is neither fast nor completely reliable we end up
     * hitting its public api over http periodically so we must wait for it to
     * be actually ready.
     */
    return new Promise((resolve, reject) => {
      // Easier to just shell out to the packager than use the JS API.
      // XXX: Uses the node only invocation so we don't have to deal with bash
      // as well... Fixes issues where server cannot be killed cleanly.
      const cmd = 'node';
      const reactNativeVersion = require('react-native/package.json').version;
      const script =
        semver.lt(reactNativeVersion, '0.14.0')
          ? ['./node_modules/react-native/packager/packager.js']
          : ['./node_modules/react-native/local-cli/cli.js', 'start'];
      const args = script.concat([
        '--root', this.entryDir,
        '--port', this.packagerPort,
      ]).concat(
        this.projectRoots ? ['--projectRoots', this.projectRoots.join(',')] : []
      ).concat(
        this.assetRoots ? ['--assetRoots', this.assetRoots.join(',')] : []
      ).concat(
        this.resetCache ? '--reset-cache' : []
      );
      const opts = {stdio: 'inherit'};
      this.packageServer = spawn(cmd, args, opts);

      function handleError(err) {
        reject(err);
      }

      this.packageServer.on('error', handleError);

      // waitForSocket retries the port every 250ms. Let's give the
      // React Native server up to 30 seconds to come online. watchman
      // can be slow to ramp up, especially on CI machines.
      waitForSocket({ port: this.packagerPort, tries: 120 }, err => {
        console.log('react-native packager ready...');
        this.packageServer.removeListener('error', handleError);
        if (err) {
          handleError(err);
          return;
        }
        resolve();
      });
    });
  }

  _startWebpackDevServer() {
    const webpackConfig = this.webpackConfig;
    const hot = this.hot;
    console.log(this.projectRoots,this.assetRoots,this.platforms,process.cwd())
    // return getReactNativeExternals({
    //   projectRoots: this.projectRoots,
    //   assetRoots: this.assetRoots,
    //   platforms: this.platforms,
    // }).then(reactNativeExternals => {

    return this.makerExt.start().then((reactNativeExternals)=>{
      
      // Coerce externals into an array, without clobbering it
      webpackConfig.externals = Array.isArray(webpackConfig.externals)
        ? webpackConfig.externals
        : [(webpackConfig.externals || {})];

      // Inject react native externals
      webpackConfig.externals.push(reactNativeExternals);

      // Transform static image references
      webpackConfig.externals.push(staticImageTransform);

      // By default webpack uses webpack://[resource-path]?[hash] in the source
      // map which is handled by its dev server. Use absolute path instead so
      // React Native's exception manager can load the source maps.
      webpackConfig.output = webpackConfig.output || {};
      if (!webpackConfig.output.devtoolModuleFilenameTemplate) {
        webpackConfig.output.devtoolModuleFilenameTemplate = '[absolute-resource-path]';
      }

      // Update webpack config for hot mode.
      if (hot) {
        makeHotConfig(webpackConfig);
      }

      // Plug into webpack compilation to extract webpack dependency tree.
      // Any React Native externals from the application source need to be
      // require()'d in the RN packager's entry file. This allows for RN
      // modules that aren't part of the main 'react-native' dependency tree
      // to be included in the generated bundle (e.g. AdSupportIOS).
      const compiler = webpack(webpackConfig);

      const compilerPromise = new Promise(resolve => {
        compiler.plugin('done', () => {
          // Write out the RN packager's entry file
          this._writeEntryFiles().then(resolve);
        });
      });

      this.webpackServer = new WebpackDevServer(compiler, {
        hot: hot,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        stats: {colors: true, chunkModules: false},
      });

      const serverPromise = new Promise(resolve => {
        this.webpackServer.listen(this.webpackPort, this.hostname, () => {
          console.log('Webpack dev server listening at ', this.webpackBaseURL);
          resolve();
        });
        // Disable any kind of automatic timeout behavior on incoming connections.
        this.webpackServer.timeout = 0;
      });

      // Ensure that both the server is up and the compiler's entry
      // file has been written for the React Native packager.
      return Promise.all([compilerPromise, serverPromise]);
    });
  }

}

module.exports = Server;
