/* 豹豹机 421：轻量白屏修复 + 减少重复下载。核心文件不再于 install 阶段强制重新拉取一遍，
   而是交给下面的 fetch 监听器在页面真正请求时顺手写入缓存，避免和页面自身加载 app.js 产生双倍流量。 */
const CACHE_NAME = "baobao-shell-v421";

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith("baobao-shell-") && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function fetchAndStore(request, cacheKey) {
  const response = await fetch(request, { cache: "no-store" });
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKey || request, response.clone());
  }
  return response;
}

async function cached(request, fallbackKey) {
  return (await caches.match(request, { ignoreSearch: true })) ||
         (fallbackKey ? await caches.match(fallbackKey, { ignoreSearch: true }) : null);
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const indexKey = new Request(new URL("./index.html", self.registration.scope).href);
      try {
        return await fetchAndStore(request, indexKey);
      } catch (_) {
        const fallback = await cached(indexKey, "./index.html");
        if (fallback) return fallback;
        return new Response(
          "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>豹豹机</title><style>body{font-family:-apple-system,sans-serif;padding:28px;line-height:1.7}button{font-size:16px;padding:10px 16px}</style><h2>页面暂时没有加载出来</h2><p>请检查网络后重新打开。</p><button onclick='location.reload()'>重新加载</button>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
    })());
    return;
  }

  // 图片、字体这类体积大且不常变的静态资源：缓存优先，命中直接用缓存，避免每次打开都重新下载几百 KB。
  if (["image", "font"].includes(request.destination)) {
    event.respondWith((async () => {
      const hit = await cached(request);
      if (hit) return hit;
      try {
        return await fetchAndStore(request, request);
      } catch (_) {
        return Response.error();
      }
    })());
    return;
  }

  // 脚本、样式、manifest 这类和版本更新强相关的文件：网络优先，保证改完代码后能及时生效。
  if (["script", "style", "manifest"].includes(request.destination)) {
    event.respondWith((async () => {
      try {
        return await fetchAndStore(request, request);
      } catch (_) {
        return (await cached(request)) || Response.error();
      }
    })());
  }
});

/* 与原版共用的 Web Push 通知逻辑。 */
function bbParsePush(event){
  if(!event.data)return {};
  try{return event.data.json()||{};}catch(error){
    try{return {body:event.data.text()};}catch(inner){return {};}
  }
}

self.addEventListener("push",event=>{
  const data=bbParsePush(event);
  const title=String(data.title||data.personaName||"豹豹机");
  const body=String(data.body||data.message||data.text||"收到一条新消息");
  const chatId=String(data.chatId||data.personaId||"");
  const target=String(data.url||data.appUrl||"./");
  const icon=new URL("./apple-touch-icon.png",self.registration.scope).href;
  const options={
    body,
    icon:data.icon||icon,
    badge:data.badge||icon,
    tag:String(data.tag||("baobao-chat-"+(chatId||"message"))),
    renotify:true,
    data:{url:target,chatId},
    silent:false
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title,options),
    self.clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
      list.forEach(client=>client.postMessage({type:"BAOBAO_PUSH_RECEIVED",chatId}));
    })
  ]));
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const data=event.notification.data||{};
  const chatId=String(data.chatId||data.personaId||"");
  const url=new URL(data.url||"./",self.registration.scope);
  if(chatId)url.searchParams.set("bbPushChat",chatId);
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(async list=>{
    for(const client of list){
      try{
        const current=new URL(client.url);
        if(current.origin!==url.origin)continue;
        await client.focus();
        try{
          if(typeof client.navigate==="function"){
            await client.navigate(url.href);
            return;
          }
        }catch(error){}
        client.postMessage({type:"BAOBAO_OPEN_CHAT",chatId});
        return;
      }catch(error){}
    }
    return self.clients.openWindow(url.href);
  }));
});
