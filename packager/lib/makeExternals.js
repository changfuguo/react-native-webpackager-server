'use strict';
/**
*  here we get React Native modules from RNPackager
*/
var path = require('path');
var fs = require('fs');

var getReactNativeExternals = require('./getReactNativeExternals.js');

var RN_VERSION = require('react-native/package.json').version;
var EXTERNAL_PATH =  path.resolve(__dirname, '../externals/' + RN_VERSION);


class makeEexternals {
	
	constructor(options){
		this.platforms = options.platforms || ['android','ios'];
		this.dev = options.dev;
		this.fileName = 'modules';
		this.projectRoots = [process.cwd()];
		this.assetRoots = [process.cwd()];
		this.init();

	}
	//here we get four lib.bundle for our projects
	init (){

		if(!fs.existsSync(EXTERNAL_PATH)) {
			fs.mkdirSync(EXTERNAL_PATH);
		}
	}

	getModulesContent () {
		return getReactNativeExternals({
				projectRoots: this.projectRoots,
				assetRoots: this.assetRoots,
				platforms: this.platforms,
		    }).then(reactNativeExternals => {
		    	return reactNativeExternals;
		    });

	}
	getFileName (){
		var fileName = this.fileName + (this.dev? '.dev.': '.') + 'js';
		return path.resolve(EXTERNAL_PATH, fileName);
	}
	writeFiles(content){
		
		var fileName = this.getFileName();
		
		return new Promise((resolve,reject) => {

			fs.writeFile(fileName, content, {
				encoding: "utf8",
				flag: "w"
			},(err) => {
				if (err) {
					reject(err);
				} else{
					resolve(true);
				}
			})
		});
	}
	getExportsContent (content) {
		var contents =  ';module.exports = ' ;
		return contents + JSON.stringify(content) + ';'
	}
	start(update) {

		return new Promise((resolve,reject) =>{
			if (!fs.existsSync(this.getFileName()) || !!update) {
				this.getModulesContent()

					.then((content)=>{
						return this.writeFiles(this.getExportsContent(content))
					})

					.then((result) => {
						resolve(require(path.resolve(EXTERNAL_PATH,this.getFileName())));
						console.log('write externals success');
					}, (err) => {
						reject(err);
					});
			} else {
				resolve(require(path.resolve(EXTERNAL_PATH,this.getFileName())));
			}
		});
	}

}

// var maker  = new makeEexternals({dev:true});

// maker.start(true);

module.exports = makeEexternals;

