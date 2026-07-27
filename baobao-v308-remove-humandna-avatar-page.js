/* baobao-v308-remove-humandna-avatar-page
   1) 点头像不再打开 Human DNA 页面（人格矩阵/情绪状态那套 UI），彻底断开这个入口。
      不删除底层 DOM/CSS 本体，只是让它进不去——避免牵连其他引用同一份 DOM 的代码。
   2) 心声（心声2.0/3.0/4.0，最终生效的是4.0）本来就通过 window.sendChatCompletion
      读取「设置 → API 设置 → 对话 API」这一份配置，不存在单独的"心声API"，
      本补丁不改动心声的调用逻辑，只是确保这里不会被后续代码破坏。
*/
(function(){
  "use strict";
  if(window.__bbRemoveHumanDNAV308)return;
  window.__bbRemoveHumanDNAV308=true;

  function neutralized(){
    return function(){
      if(typeof window.showToast==="function") window.showToast("人格DNA页面已关闭");
    };
  }

  // 自愈式覆盖 openHumanDNA：不管之后还有多少脚本重新赋值它，
  // 外部调用到的永远是"什么都不做"的版本。
  try{
    let inner=window.openHumanDNA;
    Object.defineProperty(window,"openHumanDNA",{
      configurable:true,
      get(){return inner;},
      set(v){ inner=neutralized(); }
    });
    window.openHumanDNA=neutralized();
  }catch(e){
    window.openHumanDNA=neutralized();
  }

  // 头像点击：捕获阶段直接拦截，事件根本到不了 openHumanDNA
  document.addEventListener("click",function(e){
    const el=e.target.closest && e.target.closest("#chatHeadAvatar");
    if(!el)return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  },true);

  // 如果此刻正好开着，直接关掉
  function hideOverlayIfOpen(){
    const ov=document.getElementById("humanDNAOverlay");
    if(ov) ov.classList.remove("show");
  }
  hideOverlayIfOpen();
  document.addEventListener("DOMContentLoaded",hideOverlayIfOpen);
  setTimeout(hideOverlayIfOpen,500);

  console.log("豹豹机 308：Human DNA 头像入口已移除；心声继续沿用「对话 API」设置，无需单独配置");
})();
