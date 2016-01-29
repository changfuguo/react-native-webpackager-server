该插件主要意图在做lib和app业务代码的分离；app打包直接打rn的lib代码和业务代码，
lib代码和app代码分批更新

在 [react-native-webpack-server](https://github.com/mjohnston/react-native-webpack-server)
基础上优化了以下

主要1）start服务时，不是动态生成externals，而是只生成一次
2）将用于生成lib的写法固定到具体文件里