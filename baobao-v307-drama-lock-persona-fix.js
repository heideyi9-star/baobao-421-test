/* baobao-v307-drama-lock-persona-fix
   在 v306 的基础上修两件事：
   1) v306 的台词识别正则只认“你让我…就不要我”，认不出主谓颠倒的
      “我让你不舒服了你就不要我了”这种句式，本版把这类变体也收进来。
   2) v306 靠固定时间点“抢”最后赋值权，只要后面还有脚本重新覆盖
      window.requestChatReply / window.sendChatCompletion 就可能失效。
      本版改用 defineProperty 做成“自愈式”外层包装：不管之后谁再赋值，
      都会被自动重新套上纠偏逻辑，不存在“抢不到”的情况。
*/
(function(){
  "use strict";
  if(window.__bbDramaLockV307)return;
  window.__bbDramaLockV307=true;

  const RULES=`【自然私聊纠偏 v2｜最高优先级，覆盖之前所有版本的同类规则】
1. 除非本轮对话真的在谈“结束关系 / 删除 / 拉黑”本身，否则任何抱怨、追问、数字、语气词都不能自动升级成“分手”“你不要我了”“我应该很高兴吗”这类台词。这是最常见、最需要杜绝的AI腔套路，比说教腔更容易被用户发现是模型在演戏。
2. 明确禁止这两种互为镜像的句式，出现任何一种都要重写：
   - “你让我不舒服/难受/委屈，所以你不要我了”
   - “我让你不舒服/难受，所以你就不要我了”（主谓颠倒也算，禁止用倒装当作绕过规则的方式）
3. 用户发含糊短消息（数字、单字、“？”、“嗯”）时，第一反应应该是疑惑、确认或吐槽（“啥”“你干嘛”“？”），不是委屈、防御或翻旧账。
4. 角色本身的性格设定，优先于“为了显得像真人而制造冲突”的冲动。宁可平淡、宁可就事论事，也不能无凭无据把小事升级成关系危机。
5. 一轮通常1到3条，不写连续多条控诉台词；同一件事不要反复重复控诉。
6. 若候选回复命中以上任一被禁止的句式，改写成贴合角色人设、但只针对用户这一句实际内容的自然反应——可以冷淡、嘴硬、简短，但不能是自怜或情绪勒索式的固定台词。`;

  function text(v){return String(v==null?"":v).trim();}
  function stateNow(){try{return window.state||state||{}}catch(_){return window.state||{}}}
  function personaNow(){return window.currentChatPersona||{};}
  function latestUserText(){
    const list=Array.isArray(stateNow().chatMessages)?stateNow().chatMessages:[];
    for(let i=list.length-1;i>=0;i--){
      const msg=list[i];
      if(!msg||msg.role!=="user")continue;
      const type=String(msg.type||"text").toLowerCase();
      if(type!=="text")return type==="image"?"[用户发送了一张图片]":text(msg.content||msg.caption||"");
      return text(msg.content||msg.text||"");
    }
    return "";
  }
  function recentDialogue(limit){
    const list=Array.isArray(stateNow().chatMessages)?stateNow().chatMessages:[];
    return list.filter(m=>m&&!m.recalled&&["user","assistant"].includes(m.role))
      .slice(-(limit||12)).map(m=>`${m.role==="user"?"用户":"角色"}：${text(typeof window.baobaoMessageForAI==="function"?window.baobaoMessageForAI(m):(m.content||m.text||""))}`)
      .filter(Boolean).join("\n");
  }
  function personaBlock(){
    const p=personaNow();
    return `名字：${text(p.name)||"角色"}\n背景：${text(p.persona)||"未填写"}\n性格与说话习惯：${text(p.personality)||"未填写"}\n补充：${text(p.brief)||"未填写"}`;
  }
  function isPrivateChatRequest(messages){
    if(!Array.isArray(messages))return false;
    const sys=messages.filter(m=>m&&m.role==="system").map(m=>text(m.content)).join("\n");
    const positive=/HCE\s*v3|真人聊天内核|正在手机私聊|当前角色完整人设|角色回复校验器|贴人设要求/.test(sys);
    const negative=/心声生成器|内心活动生成器|朋友圈|独立NPC|短信NPC|只输出合法JSON|视觉识别|头像选择|手机内容生成器/.test(sys);
    return positive&&!negative;
  }

  // 主谓颠倒也能识别的“分手台词”正则
  const DRAMA_RE=/(你让我.{0,16}(?:就)?不要我|我让你.{0,16}(?:就)?不要我了?|你就不要我了|那就分手|行吧[，, ]*分手|我为什么不能分手|我应该.{0,8}(?:高兴|开心).{0,2}[?？]|随时能跑的狗|不需要随时能跑|反正你.{0,8}不要我|求之不得|遵命|被宝宝拴住)/;
  const SCRIPT_RE=/(?:^|\n).{0,25}(?:你不要我了|那就分手|我应该很高兴|我为什么不能分手).*(?:\n|$)/;

  function needsRewrite(reply,user){
    const value=text(reply),u=text(user);
    if(!value)return false;
    const lines=value.split(/\n+/).filter(Boolean);
    if(DRAMA_RE.test(value)||SCRIPT_RE.test(value))return true;
    if(/^\d{1,8}$/.test(u)&&value.length>24)return true;
    // 台词感：一次回复里堆了两句以上“不舒服/分手/不要/难受”，比v306更早触发
    const hits=(value.match(/不舒服|分手|不要|烦|生气|难受|失望/g)||[]).length;
    if(lines.length>=2&&hits>=2)return true;
    if(/我应该.{0,12}[?？]/.test(value))return true;
    return false;
  }

  async function rewriteNaturally(candidate){
    if(typeof window.sendChatCompletion!=="function")return candidate;
    const user=latestUserText();
    const prompt=`你是私聊回复纠偏器。只重写候选回复，不解释任务。\n\n${RULES}\n\n【角色】\n${personaBlock()}\n\n【最近对话】\n${recentDialogue(12)||"暂无"}\n\n【用户最新消息】\n${user||"暂无"}\n\n【需要纠偏的候选回复】\n${text(candidate)}\n\n要求：保留角色真正的脾气和立场，但去掉无依据的分手脑补、自怜、情绪勒索、重复控诉和台词感。直接回应当前问题。输出1到3行手机消息，不编号，不加引号。`;
    try{
      const fixed=await window.sendChatCompletion([
        {role:"system",content:"你只负责把不自然的角色私聊改得像真人，保持人设，不添加新事实。"},
        {role:"user",content:prompt}
      ]);
      return text(fixed)||candidate;
    }catch(_){return candidate;}
  }

  function naturalSplit(reply){
    let value=text(reply).replace(/^```[a-z]*\s*/i,"").replace(/```$/g,"").trim();
    let parts=value.split(/\n+/).map(text).filter(Boolean);
    parts=parts.filter((line,index)=>index===0||line!==parts[index-1]);
    if(parts.length===1&&parts[0].length>95){
      const sentences=parts[0].split(/(?<=[。！？!?…])\s*/).map(text).filter(Boolean);
      if(sentences.length>1){
        parts=[sentences[0],sentences.slice(1).join("")];
      }
    }
    if(parts.length>3){
      parts=[parts[0],parts[1],parts.slice(2).join("")];
    }
    return parts.length?parts:["嗯"];
  }

  function wrapSend(fn){
    if(typeof fn!=="function"||fn.__bbV307Send)return fn;
    const wrapped=async function(messages,apiOverride){
      if(isPrivateChatRequest(messages)){
        const copy=messages.map(m=>m&&typeof m==="object"?{...m}:m);
        const firstSystem=copy.find(m=>m&&m.role==="system");
        if(firstSystem)firstSystem.content=text(firstSystem.content)+"\n\n"+RULES;
        else copy.unshift({role:"system",content:RULES});
        return fn.call(this,copy,apiOverride);
      }
      return fn.apply(this,arguments);
    };
    wrapped.__bbV307Send=true;
    return wrapped;
  }

  function wrapReply(fn){
    if(typeof fn!=="function"||fn.__bbV307Reply)return fn;
    const wrapped=async function(){
      const result=await fn.apply(this,arguments);
      if(!result)return result;
      const user=latestUserText();
      if(needsRewrite(result,user))return await rewriteNaturally(result);
      return result;
    };
    wrapped.__bbV307Reply=true;
    return wrapped;
  }

  // 自愈式覆盖：不管之后有多少脚本重新给这两个函数赋值，
  // 都会被自动套上纠偏逻辑，不再依赖“谁最后加载谁生效”的时间竞速。
  function selfHealingOverride(propName,wrapFn){
    let inner=window[propName];
    let current=typeof inner==="function"?wrapFn(inner):inner;
    try{
      Object.defineProperty(window,propName,{
        configurable:true,
        enumerable:true,
        get(){return current;},
        set(v){
          inner=v;
          current=typeof v==="function"?wrapFn(v):v;
        }
      });
    }catch(e){
      // 万一该属性已被设为不可配置，退回普通赋值方式
      window[propName]=typeof inner==="function"?wrapFn(inner):inner;
    }
  }

  function installSplitter(){
    window.BaobaoPersonaEngine=window.BaobaoPersonaEngine||{};
    window.BaobaoPersonaEngine.splitHumanMessages=naturalSplit;
    window.bbNaturalSplitV307=naturalSplit;
  }

  function boot(){
    selfHealingOverride("sendChatCompletion",wrapSend);
    selfHealingOverride("requestChatReply",wrapReply);
    installSplitter();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
  window.addEventListener("pageshow",boot);
  console.log("豹豹机 307：分手台词自愈式拦截已启用（主谓颠倒句式已覆盖）");
})();
