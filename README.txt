豹豹机4.9 · 421 图片瘦身版（在你的 420 轻量白屏修复版基础上修改）

这次改了什么：

1. 【核心修复】app.js 里塞了 3 张写死的大图（base64），占了 2.3MB，
   导致 app.js 从该有的大小膨胀到 4.06MB，页面必须把这 4MB 全部下载
   解析完才能开始渲染，这是加载慢/进不去的主要原因。
   现在把这 3 张图抽成独立文件放进 ./assets/ 目录，用相对路径引用：
     - assets/page2-mini-profile-frame.png（原 993934 字符 -> 745KB 图片）
     - assets/page1-polaroid-widget-bg.png（原 715154 字符 -> 536KB 图片）
     - assets/page2-mini-song-frame.png（原 575098 字符 -> 431KB 图片）
     - assets/default-wallpaper.jpeg（原 49115 字符 -> 37KB 图片）
   app.js 从 4.06MB 降到约 1.83MB。

2. 【核心修复】sw.js 之前在 install 阶段会用 cache:"reload" 把 index.html/
   app.css/app.js/图标/manifest 全部强制重新下载一遍——而页面自己加载
   app.js 时已经下载了一次，等于首次打开要传输接近两倍流量。
   现在去掉了这个 install 阶段的整体预抓取，改成：
     - 脚本/样式/manifest：网络优先（改代码后能及时生效）
     - 图片/字体：缓存优先（命中直接用缓存，不用每次都重新下载大图）

3. 顺手把之前提到过的问题也修了：baobao-v307-drama-lock-persona-fix.js
   和 baobao-v308-remove-humandna-avatar-page.js 这两个补丁文件之前一直
   没有被 index.html 引用，等于没生效，这次加上了 <script> 标签接入。

4. 版本号统一改成 421（index.html / sw.js / manifest 里之前分别是
   420/420/420 但内容其实各写各的，已经对齐）。

部署方式不变：把压缩包最外层的文件（含 assets/ 文件夹）整体上传到
GitHub 仓库根目录即可，覆盖原来的文件。部署后如果手机还显示旧版本，
打开同目录下的 refresh.html 一次即可清缓存。
