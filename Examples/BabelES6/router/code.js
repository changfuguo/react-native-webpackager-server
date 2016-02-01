'use strict';
var url = require('url');
var Promise = require('bluebird');
var webpack = require('webpack');
var crypto = require('crypto');
var libCache ={};
var context = null;
var UglifyJS = require("uglify-js");

module.exports = function(ctx){
	var server  = ctx.server;

	context = ctx;

	server.get('/lib.code',assembleLib);

	server.get('/app.code',assembleApp);

	server.get('/all.code',assembleAll);
}



/*
* output md5 for file 
*/

function md5(content){
  var md5 = crypto.createHash('md5');
  md5.update(content);
  return md5.digest('hex');
}
/**
* get cache keys from query by platform\minify\dev
*/
function getCacheKey(query) {

	if (!query) {
		return '';
	} 

	var keys = [];
     
    if (query.platform == 'ios' || query.platform == 'android') {
    	keys.push(query.platform);
    } else {
    	return '';
    }

    if (query.minify == 'true'){
    	keys.push('true');
    } else {
    	keys.push('false');
    }
	if (!query.dev || query.dev == 'true') {
    	keys.push('true');
    } else {
    	keys.push('false');
    }
    return keys.join('_');

}


function assembleLib(req, res, next){
const parsedUrl = url.parse(req.url, /* parse query */ true);
    const urlSearch = parsedUrl.search;
    const platform = parsedUrl.query.platform;

    // Forward URL params to RN packager
    const reactCodeURL = context._getReactCodeURL(platform) + urlSearch;
    const appCodeURL = context._getAppCodeURL(platform);

   var key = getCacheKey(req.query);
    if (libCache[key]) {
		Promise.props({
				reactCode: context.fetch(reactCodeURL)
		    })
			.then(r => {
		      res.set('Content-Type', 'application/javascript');
		      res.send(r.reactCode);
		    }).catch(err => next(err));
    } else {
    	Promise.props({
	      reactCode: context.fetch(reactCodeURL)
	    }).then(r =>{
	    	libCache[key] = r.reactCode;
	    	res.set('Content-Type', 'application/javascript');
	      	res.send(r.reactCode);
	    }).catch(err => next(err));
    }
}

function assembleApp(req, res, next){
	const parsedUrl = url.parse(req.url, /* parse query */ true);
    const urlSearch = parsedUrl.search;
    const platform = parsedUrl.query.platform;

    // Forward URL params to RN packager
    const appCodeURL = context._getAppCodeURL(platform);


	Promise.props({
      appCode: context.fetch(appCodeURL),
    }).then(r => {
      res.set('Content-Type', 'application/javascript');
      if (req.query.minify == 'true') {
      	return res.send(UglifyJS.minify(r.appCode , {fromString: true}).code);
      }
      res.send(r.appCode);
    }).catch(err => next(err));
    
}

/**
*  get lib code from 
*
***/
function assembleAll(req, res, next){
	const parsedUrl = url.parse(req.url, /* parse query */ true);
    const urlSearch = parsedUrl.search;
    const platform = parsedUrl.query.platform;

    // Forward URL params to RN packager
    const reactCodeURL = context._getReactCodeURL(platform) + urlSearch;
    const appCodeURL = context._getAppCodeURL(platform);

   var key = getCacheKey(req.query);
    if (libCache[key]) {
		Promise.props({
		      appCode: context.fetch(appCodeURL),
		    }).then(r =>
		      context._createBundleCode(libCache[key], r.appCode, urlSearch, platform)
		    ).then(bundleCode => {
		      res.set('Content-Type', 'application/javascript');
		      res.send(bundleCode);
		    }).catch(err => next(err));
    } else {
    	Promise.props({
	      reactCode: context.fetch(reactCodeURL),
	      appCode: context.fetch(appCodeURL),
	    }).then(r =>{
	    	libCache[key] = r.reactCode;
	    	if (req.query.minify ==  'true') {
	    		r.appCode = UglifyJS.minify(r.appCode , {fromString: true}).code;
	    	}
	      	return context._createBundleCode(r.reactCode, r.appCode, urlSearch, platform)
	    }
	    ).then(bundleCode => {
	      res.set('Content-Type', 'application/javascript');
	      res.send(bundleCode);
	    }).catch(err => next(err));
    }
    
}

