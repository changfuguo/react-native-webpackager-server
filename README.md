# react-native-webpackager-server

> 该插件主要意图在做lib和app业务代码的分离；[react-native-webpack-server](https://github.com/mjohnston/react-native-webpack-server)里基本上已经实现了一套代码分离服务；在该插件基础上优化了一些东西，感谢该作者哈~

## react-native-webpack-server分离

react-native-webpack-server分离启动了三个服务

* 8081是原来RN服务，用来打包RN的lib代码
* 8082是webpack-dev-server，用来打包app的业务代码
* 8080 是新建的server服务，生成webpack的external输出8081和8082的合并结果

但是发现作者打包的过程和RN的过程一样，启动非常慢，做了几点改进，

# 安装
  `npm install --save-dev react-native-webpackager-server`

# 使用
  
  具体用法，可参考demo里用法，
  也可以用[react-native-webpack-server](https://github.com/mjohnston/react-native-webpack-server)原来的用法，
  demo的用法我自己写个8080的router，在执行 `npm run start` 时传入了 自定义ruoter的方法
  
  demo里的示例放在./router文件夹里，供8080的server调用，传入的参数可自己查看代码进行定制

  获取所有代码的 地址为`http://localhost:8080/all.code?platform=ios&dev=false&minify=true`

  获取RN的lib的 地址为`http://localhost:8080/lib.code?platform=ios&dev=false&minify=true`

  获取业务代码的 地址为`http://localhost:8080/app.code?platform=ios&dev=false&minify=true`

## 优化体现在以下两方面

1 start服务时，不是动态生成externals，而是只生成一次

优化webpack打包生成externals的方法，只在第一次生成时按照RN版本+是否是dev生成对应的externals文件，下次
根据请求的RN版本+dev参数的文件，因为只有这两个参数会影响externals

2 将用于生成lib的写法固定到具体文件里，分为ios和android

3 缓存lib库

在调试的时候，任何变动都会引起RN打包（这里没有仔细看是否制定projectRoot参数是否会起作用），
但是实际上RN的lib文件变动只和platform、dev和minify三个参数有关，按照这三个参数进行缓存，加快输出速度

4 webpack的minify通过引入uglify-js根据参数来输出

5 引入手动制定server的routes

  具体用法和 react-native-webpackager-server 一样 启动的时候加入routerServer的地址，
  具体可见router文件，里面有三个路由可以生成lib、app以及所有代码的输出 

6 webpack的demo 见webpack.config.js.demo

  其中 1 2 3都可以大大提高启动和调试时获取bundle的速度，尤其是缓存了当前rn版本对应的lib库后；

  5引入自定义的router之后 ，可以很灵活的结合自己业务进行lib库和app本身的逻辑代码，发布app时，把bundle拆分为lib和app代码，
  可以减少bundle下行下载的速度，不用下载rn的lib库

## 后续优化

1  对分离的lib代码和app代码，提供一个服务进行单独的版本管理，目前可想到的根据端类型（ios或android）+端版本+RN版本+业务代码进行更新

2  热更新机制，这个还没仔细研究RN是怎么实现的，看能不能webpack也实现下，原来的 react-native-webpack-server是没有实现

