该插件主要意图在做lib和app业务代码的分离；app打包直接打rn的lib代码和业务代码，
lib代码和app代码分批更新；主要考虑到该插件作者不再维护了，所以我自己fork下想用啥需求就改啥需求吧；感谢原作者哈

在 [react-native-webpack-server](https://github.com/mjohnston/react-native-webpack-server)
基础上优化了以下

## 优化体现在以下两方面

1）start服务时，不是动态生成externals，而是只生成一次
2）将用于生成lib的写法固定到具体文件里

## 后续优化

在现在服务上继续可直接推送到版本管理器上，并且直接将server中合并代码的部分分离开来，单独请求


