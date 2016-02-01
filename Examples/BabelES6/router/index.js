'use strict';
var fs = require('fs');
module.exports = function (ctx){

	var server  = ctx.server;
	var routerRoot = __dirname;
	fs.readdirSync(routerRoot).forEach(function(file){
           //just loaded Ruotes file 
           if(~file.indexOf('.js') && file.substr(-3) == '.js' && file != 'index.js'){
               require(routerRoot + '/' + file)(ctx);
            }
      })

}