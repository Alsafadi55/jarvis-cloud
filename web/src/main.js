import { createClient } from "@supabase/supabase-js";
import "./style.css";
import { renderWorkspacePage } from "./workspace.js";
import { saveProviderKey, loadProviderKeys, deleteProviderKey } from "./secure-store.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes("YOUR_PROJECT") && !SUPABASE_ANON_KEY.includes("YOUR_"));
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const PROVIDERS=[{id:"gemini",name:"Google Gemini"},{id:"openai",name:"OpenAI"},{id:"anthropic",name:"Anthropic Claude"},{id:"deepseek",name:"DeepSeek"},{id:"xai",name:"xAI"},{id:"openrouter",name:"OpenRouter"},{id:"groq",name:"Groq"},{id:"mistral",name:"Mistral"},{id:"together",name:"Together AI"},{id:"perplexity",name:"Perplexity"}];
const state={user:null,conversations:[],activeId:null,busy:false,providerKeys:{},models:[],selectedProvider:"gemini",selectedModel:"",skills:[],plugins:[],projects:[],selectedProjectId:null,attachments:[],agentMode:false,view:"dashboard"};
const app = document.querySelector("#app");

const icon = (name) => ({
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  logout: '<svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z"/><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14Z"/></svg>'
})[name] || "";

function render() {
  if (!configured) {
    app.innerHTML = `<main class="setup"><div class="brand"><div class="brand-mark">${icon("spark")}</div><span>JARVIS<span class="muted"> CLOUD</span></span></div><section class="setup-card"><div class="eyebrow">INITIAL SETUP</div><h1>Connect your cloud brain.</h1><p>The web interface is ready. Add your Supabase project URL and publishable key to the Vercel environment variables to enable secure sign-in.</p><div class="steps"><div><b>01</b><span>Open your Supabase project settings.</span></div><div><b>02</b><span>Copy the Project URL and publishable key (or legacy anon key).</span></div><div><b>03</b><span>Add them as <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in Vercel, then redeploy.</span></div></div><p class="note">Never use a service-role key or secret key in this website.</p></section><div class="footer">JARVIS CLOUD · PRIVATE BY DESIGN</div></main>`;
    return;
  }
  if (!state.user) {
    app.innerHTML = `<main class="auth-shell"><div class="brand"><div class="brand-mark">${icon("spark")}</div><span>JARVIS<span class="muted"> CLOUD</span></span></div><section class="auth-card"><div class="eyebrow">PERSONAL AI WORKSPACE</div><h1>Welcome back.</h1><p class="sub">Your assistant, connected across your devices.</p><form id="auth-form"><label>Email address<input id="email" type="email" autocomplete="email" required placeholder="you@example.com"></label><label>Password<input id="password" type="password" autocomplete="current-password" required minlength="6" placeholder="At least 6 characters"></label><button class="primary" id="signin" type="submit">Sign in <span>↗</span></button><button class="secondary" id="signup" type="button">Create an account</button><div id="auth-error" class="feedback" role="status"></div></form></section><div class="footer">SECURE AUTHENTICATION · SUPABASE</div></main>`;
    document.querySelector("#auth-form").addEventListener("submit", signIn);
    document.querySelector("#signup").addEventListener("click", signUp);
    return;
  }
  app.innerHTML = `<div class="workspace"><aside class="sidebar"><div class="brand"><div class="brand-mark">${icon("spark")}</div><span>JARVIS<span class="muted"> CLOUD</span></span></div><button class="new-chat" id="new-chat">${icon("plus")} New conversation</button><div class="side-label">WORKSPACE</div><button class="history-item" id="nav-dashboard">◈ &nbsp; Dashboard</button><button class="history-item" id="nav-projects">▣ &nbsp; Projects</button><button class="history-item" id="nav-chat">✧ &nbsp; Chat</button><button class="history-item" id="nav-plugins">▦ &nbsp; Plugins</button><button class="history-item" id="nav-skills">◇ &nbsp; Skills</button><button class="history-item" id="nav-files">⌁ &nbsp; Files</button><button class="history-item" id="nav-memory">◉ &nbsp; Memory</button><button class="history-item" id="nav-tasks">☷ &nbsp; Tasks</button><button class="history-item" id="nav-activity">◷ &nbsp; Activity</button><button class="history-item" id="nav-settings">⚙ &nbsp; Settings</button><div class="side-label">YOUR HISTORY</div><div class="history" id="history">${state.conversations.map(c => `<button class="history-item ${c.id===state.activeId?"active":""}" data-id="${c.id}">${escapeHtml(c.title || "New conversation")}</button>`).join("") || '<div class="empty-history">Your conversations will appear here.</div>'}</div><div class="profile"><div class="avatar">${escapeHtml((state.user.email||"J").slice(0,1).toUpperCase())}</div><div class="profile-info"><b>${escapeHtml(state.user.email || "JARVIS user")}</b><span>Connected account</span></div><button class="icon-button" id="logout" aria-label="Sign out">${icon("logout")}</button></div></aside><main class="chat-area"><header class="topbar"><div><span class="online-dot"></span><span>JARVIS SYSTEM</span></div><div class="topbar-actions"><span class="secure-label">PRIVATE SESSION</span><select id="project-context" class="project-context" aria-label="Current project"><option value="">No project context</option>${(state.projects||[]).map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("")}</select><button class="models-toggle" id="open-models" type="button">Models & API <span>↗</span></button></div></header><section class="conversation" id="conversation"><div class="welcome"><div class="welcome-orb">${icon("spark")}</div><div class="eyebrow">YOUR PERSONAL AI</div><h1>What can I help you<br><em>with today?</em></h1><p>Your cloud workspace is connected. Start a conversation with JARVIS.</p><div class="suggestions"><button data-prompt="Help me organize my projects">Organize my projects <span>↗</span></button><button data-prompt="Explain how JARVIS Cloud works">Explain JARVIS Cloud <span>↗</span></button><button data-prompt="Help me plan my next week">Plan my week <span>↗</span></button></div></div></section><div class="composer-wrap"><div class="composer-tools"><button type="button" id="agent-toggle" class="agent-toggle" aria-pressed="false">✦ Agent mode <span>OFF</span></button><span class="agent-hint">Plan tasks and use your JARVIS workspace tools</span></div><div id="chat-feedback" class="chat-feedback" role="status"></div><form class="composer" id="chat-form"><button class="attach-button" id="attach-files" type="button" aria-label="Attach files">＋</button><input id="chat-files" type="file" hidden multiple accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/markdown,application/json,.js,.ts,.py,.html,.css"><textarea id="message" rows="1" placeholder="Message JARVIS..." maxlength="20000"></textarea><button class="send-button" type="submit" aria-label="Send message">${icon("send")}</button></form><div id="attachment-list" class="attachment-list"></div><div class="composer-hint">JARVIS can make mistakes. Verify important information.</div></div></main><aside class="models-drawer" id="models-drawer"><div class="drawer-head"><div><div class="eyebrow">MODEL SETTINGS</div><h2>API Keys & Models</h2></div><button class="icon-button" id="close-models" aria-label="Close">×</button></div><div class="drawer-section-title">API KEYS <span>Connect your providers</span></div><div id="provider-cards" class="provider-cards"></div><div class="key-note">Provider keys are encrypted with AES-GCM and stored in this browser on this device. They are not uploaded to Supabase and do not sync to other devices. Keep this device protected. Provider API usage may have separate charges.</div><div id="provider-feedback" class="feedback" role="status"></div><div class="model-list-head"><span>ALL AVAILABLE MODELS</span><button id="refresh-models" type="button">Refresh</button></div><input id="model-search" class="model-search" type="search" placeholder="Search connected models..."><div id="model-list"><div class="empty-history">Connect a provider to load models.</div></div></aside></div>`;
  document.querySelector("#logout").addEventListener("click", signOut);
  document.querySelector("#open-models").addEventListener("click", () => document.querySelector("#models-drawer").classList.add("open"));
  document.querySelector("#close-models").addEventListener("click", () => document.querySelector("#models-drawer").classList.remove("open"));
  const projectContext=document.querySelector("#project-context");
  if(projectContext){
    projectContext.value=state.selectedProjectId||"";
    projectContext.addEventListener("change",async()=>{
      state.selectedProjectId=projectContext.value||null;
      try{if(state.selectedProjectId)localStorage.setItem("jarvis-project:"+state.user.id,state.selectedProjectId);else localStorage.removeItem("jarvis-project:"+state.user.id);}catch{}
      if(state.activeId){
        const {error}=await supabase.from("conversations").update({project_id:state.selectedProjectId}).eq("id",state.activeId).eq("user_id",state.user.id);
        if(error)feedback("chat-feedback","Could not update this conversation's project.");
        state.conversations=state.conversations.map(item=>item.id===state.activeId?{...item,project_id:state.selectedProjectId}:item);
      }
    });
  }
  renderProviderCards(); renderModelList();
  document.querySelector("#refresh-models").addEventListener("click", refreshAllModels);
  document.querySelector("#model-search").addEventListener("input", renderModelList);

  document.querySelector("#new-chat").addEventListener("click", newConversation);
  document.querySelector("#nav-dashboard").addEventListener("click",()=>showWorkspaceView("dashboard"));
  document.querySelector("#nav-projects").addEventListener("click",()=>showWorkspaceView("projects"));
  document.querySelector("#nav-chat").addEventListener("click",()=>showWorkspaceView("chat"));
  document.querySelector("#nav-plugins").addEventListener("click",()=>showWorkspaceView("plugins"));
  document.querySelector("#nav-skills").addEventListener("click",()=>showWorkspaceView("skills"));
  ["files","memory","tasks","activity","settings"].forEach(view=>document.querySelector("#nav-"+view).addEventListener("click",()=>showWorkspaceView(view)));
  document.querySelector("#attach-files").addEventListener("click",()=>document.querySelector("#chat-files").click());
  document.querySelector("#chat-files").addEventListener("change",handleChatFiles);
  document.querySelector("#chat-form").addEventListener("submit", sendMessage);
  const agentToggle=document.querySelector("#agent-toggle");
  if(agentToggle){
    agentToggle.classList.toggle("active",state.agentMode);
    agentToggle.setAttribute("aria-pressed",String(state.agentMode));
    agentToggle.querySelector("span").textContent=state.agentMode?"ON":"OFF";
    agentToggle.addEventListener("click",()=>{
      state.agentMode=!state.agentMode;
      agentToggle.classList.toggle("active",state.agentMode);
      agentToggle.setAttribute("aria-pressed",String(state.agentMode));
      agentToggle.querySelector("span").textContent=state.agentMode?"ON":"OFF";
    });
  }
  const messageBox = document.querySelector("#message");
  messageBox.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      document.querySelector("#chat-form").requestSubmit();
    }
  });
  messageBox.addEventListener("input", () => {
    messageBox.style.height = "auto";
    messageBox.style.height = Math.min(messageBox.scrollHeight, 180) + "px";
  });
  document.querySelectorAll("[data-prompt]").forEach(b => b.addEventListener("click", () => { document.querySelector("#message").value = b.dataset.prompt; document.querySelector("#message").focus(); }));
  document.querySelectorAll("[data-id]").forEach(b => b.addEventListener("click", () => selectConversation(b.dataset.id)));
  if (state.activeId) loadMessages(state.activeId);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
}
function feedback(id, message, kind = "error") {
  const el = document.querySelector("#"+id);
  if (el) { el.textContent = message; el.className = (id === "chat-feedback" ? "chat-feedback " : "feedback ") + kind; }
}
async function signIn(e) {
  e.preventDefault();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return feedback("auth-error", error.message);
  state.user = data.user; await afterAuth();
}
async function signUp() {
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  if (!email || password.length < 6) return feedback("auth-error", "Enter a valid email and a password with at least 6 characters.");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return feedback("auth-error", error.message);
  if (!data.session) return feedback("auth-error", "Account created. Check your email to confirm it, then sign in.", "success");
  state.user = data.user; await afterAuth();
}
async function signOut() { await supabase.auth.signOut(); state.user = null; state.conversations = []; state.activeId = null; state.providerKeys = {}; state.models = []; state.selectedProvider = "gemini"; state.selectedModel = ""; state.skills=[]; state.plugins=[]; state.projects=[]; state.selectedProjectId=null; state.attachments=[]; state.agentMode=false; render(); }
async function afterAuth() {
  try { state.providerKeys = await loadProviderKeys(state.user.id); }
  catch (error) { console.warn("Could not restore encrypted provider keys:", error); state.providerKeys = {}; }
  await Promise.all([loadConversations(),loadSkills(),loadPlugins(),loadProjects()]);
  try {
    const savedProject=localStorage.getItem("jarvis-project:"+state.user.id);
    state.selectedProjectId=state.conversations.find(item=>item.id===state.activeId)?.project_id||savedProject||null;
  } catch { state.selectedProjectId=state.conversations.find(item=>item.id===state.activeId)?.project_id||null; }
  await loadServerGemini();
  await refreshRestoredModels();
  try {
    const saved=JSON.parse(localStorage.getItem("jarvis-model:"+state.user.id)||"null");
    if(saved&&state.models.some(m=>m.provider===saved.provider&&m.id===saved.model)){
      state.selectedProvider=saved.provider;state.selectedModel=saved.model;
    } else if(!state.selectedModel&&state.models.length){
      state.selectedProvider=state.models[0].provider;state.selectedModel=state.models[0].id;
    }
  } catch {}
  render();
  await showWorkspaceView("dashboard");
}
async function refreshRestoredModels() {
  const entries = Object.entries(state.providerKeys).filter(([id,key]) => id !== "gemini" || key !== "__SERVER_GEMINI__");
  for (const [provider,key] of entries) {
    try {
      const result = await supabase.functions.invoke("chat",{body:{action:"models",provider,api_key:key}});
      if (!result.error && !result.data?.error) {
        state.models = state.models.filter(m=>m.provider!==provider).concat((result.data.models||[]).map(m=>({provider,providerName:PROVIDERS.find(p=>p.id===provider)?.name||provider,id:m.id})));
      }
    } catch (error) { console.warn("Could not refresh models for",provider); }
  }
  state.models.sort((a,b)=>a.providerName.localeCompare(b.providerName)||a.id.localeCompare(b.id));
}
async function loadConversations() {
  const { data, error } = await supabase.from("conversations").select("id,title,updated_at,project_id").order("updated_at", { ascending:false }).limit(50);
  if (error) { console.error(error); return; }
  state.conversations = data || [];
  state.activeId = state.conversations[0]?.id || null;
}
async function newConversation() {
  const { data, error } = await supabase.from("conversations").insert({ user_id: state.user.id, title:"New conversation", project_id:state.selectedProjectId }).select("id,title,updated_at,project_id").single();
  if (error) return feedback("chat-feedback", error.message);
  state.conversations.unshift(data); state.activeId = data.id; render(); await showWorkspaceView("chat");
}
async function selectConversation(id) { state.activeId = id; state.selectedProjectId=state.conversations.find(item=>item.id===id)?.project_id||null; render(); await showWorkspaceView("chat"); }
async function loadMessages(id) {
  const area = document.querySelector("#conversation");
  if (!area) return;
  area.innerHTML = '<div class="message assistant-message">Loading conversation...</div>';
  const { data, error } = await supabase.from("messages").select("role,content")
    .eq("conversation_id", id).order("created_at", { ascending: true }).limit(100);
  if (error) { area.innerHTML = '<div class="system-notice"><p>Could not load this conversation.</p></div>'; return; }
  if (!data?.length) { showWelcome(); return; }
  area.innerHTML = data.map(m => `<div class="message ${m.role === "user" ? "user-message" : "assistant-message"}">${escapeHtml(m.content).replace(/\\n/g, "<br>")}</div>`).join("");
  area.scrollTop = area.scrollHeight;
}
function showWelcome() {
  const area = document.querySelector("#conversation");
  if (area) area.innerHTML = `<div class="welcome compact"><div class="welcome-orb">${icon("spark")}</div><div class="eyebrow">CONVERSATION SELECTED</div><h1>Ready when<br><em>you are.</em></h1><p>Your messages and replies are saved in this conversation.</p></div>`;
}
async function loadServerGemini(){
 if(state.providerKeys.gemini)return;
 try{
  const result=await supabase.functions.invoke("chat",{body:{action:"models",provider:"gemini"}});
  if(result.error||result.data?.error)return;
  state.providerKeys.gemini="__SERVER_GEMINI__";
  state.models=state.models.filter(m=>m.provider!=="gemini").concat((result.data.models||[]).map(m=>({provider:"gemini",providerName:"Google Gemini (server key)",id:m.id})));
  if(!state.selectedModel){state.selectedProvider="gemini";state.selectedModel=state.models.find(m=>m.provider==="gemini")?.id||"";}
 }catch(e){console.warn("Server Gemini model discovery unavailable.");}
}
function renderProviderCards(){
 const root=document.querySelector("#provider-cards");if(!root)return;
 root.innerHTML=PROVIDERS.map(p=>{const connected=!!state.providerKeys[p.id];return '<section class="provider-card"><div class="provider-card-top"><b>'+escapeHtml(p.name)+'</b><span class="provider-status '+(connected?'connected':'')+'">'+(connected?'CONNECTED':'NOT CONNECTED')+'</span></div><input class="api-key-input" id="key-'+p.id+'" type="password" autocomplete="off" placeholder="'+(connected?'Key connected · enter new key to replace':'Paste '+p.name+' API key')+'"><div class="provider-actions"><button class="primary" data-connect="'+p.id+'" type="button">'+(connected?'Replace / Test':'Connect & load models')+'</button>'+(connected?'<button class="secondary" data-disconnect="'+p.id+'" type="button">Disconnect</button>':'')+'</div></section>';}).join("");
 root.querySelectorAll("[data-connect]").forEach(b=>b.addEventListener("click",()=>connectProvider(b.dataset.connect)));
 root.querySelectorAll("[data-disconnect]").forEach(b=>b.addEventListener("click",()=>disconnectProvider(b.dataset.disconnect)));
}
function renderModelList(){
 const root=document.querySelector("#model-list");if(!root)return;
 const q=(document.querySelector("#model-search")?.value||"").toLowerCase();
 const list=state.models.filter(m=>(m.id+" "+m.providerName).toLowerCase().includes(q));
 root.innerHTML=list.length?list.map(m=>{const active=m.provider===state.selectedProvider&&m.id===state.selectedModel;return '<button class="model-option '+(active?'selected':'')+'" data-provider="'+m.provider+'" data-model="'+escapeHtml(m.id)+'"><b>'+escapeHtml(m.id)+'</b><span>'+escapeHtml(m.providerName)+(active?' · Selected':'')+'</span></button>';}).join(""):'<div class="empty-history">'+(state.models.length?'No matching models.':'Connect providers to aggregate their models here.')+'</div>';
 root.querySelectorAll("[data-model]").forEach(b=>b.addEventListener("click",()=>{state.selectedProvider=b.dataset.provider;state.selectedModel=b.dataset.model;try{localStorage.setItem("jarvis-model:"+state.user.id,JSON.stringify({provider:state.selectedProvider,model:state.selectedModel}));}catch{}renderModelList();feedback("provider-feedback","Selected "+b.dataset.model,"success");}));
}
async function connectProvider(provider){
 const input=document.querySelector("#key-"+provider),key=input?.value.trim();if(!key)return feedback("provider-feedback","Paste the API key first.");
 const btn=document.querySelector('[data-connect="'+provider+'"]');if(btn){btn.disabled=true;btn.textContent="Checking key...";}
 try{
  const result=await supabase.functions.invoke("chat",{body:{action:"models",provider:provider,api_key:key}});
  if(result.error||result.data?.error)throw new Error(result.data?.message||result.error?.message||"Could not verify key.");
  await saveProviderKey(state.user.id,provider,key);
  state.providerKeys[provider]=key;
  state.models=state.models.filter(m=>m.provider!==provider).concat((result.data.models||[]).map(m=>({provider:provider,providerName:PROVIDERS.find(p=>p.id===provider).name,id:m.id})));
  state.models.sort((x,y)=>x.providerName.localeCompare(y.providerName)||x.id.localeCompare(y.id));
  state.selectedProvider=provider;state.selectedModel=state.models.find(m=>m.provider===provider)?.id||"";
  render();await showWorkspaceView(state.view);document.querySelector("#models-drawer")?.classList.add("open");
  feedback("provider-feedback","Connected "+PROVIDERS.find(p=>p.id===provider).name+". Loaded "+(result.data.models||[]).length+" models.","success");
 }catch(err){feedback("provider-feedback",err.message||"Connection failed.");}
}
async function refreshAllModels(){
 const pairs=Object.entries(state.providerKeys);if(!pairs.length)return feedback("provider-feedback","Connect a provider first.");
 for(const pair of pairs){const provider=pair[0],key=pair[1];const result=await supabase.functions.invoke("chat",{body:{action:"models",provider:provider,api_key:key==="__SERVER_GEMINI__"?undefined:key}});if(!result.error&&!result.data?.error)state.models=state.models.filter(m=>m.provider!==provider).concat((result.data.models||[]).map(m=>({provider:provider,providerName:PROVIDERS.find(p=>p.id===provider).name,id:m.id})));else feedback("provider-feedback","Could not refresh "+provider+".");}
 renderModelList();feedback("provider-feedback","Model list refreshed.","success");
}
async function disconnectProvider(provider){
 delete state.providerKeys[provider];
 try { await deleteProviderKey(state.user.id,provider); } catch (error) { feedback("provider-feedback","Could not remove the saved encrypted key."); return; }
 state.models=state.models.filter(m=>m.provider!==provider);
 if(state.selectedProvider===provider){state.selectedProvider="gemini";state.selectedModel="";}
 renderProviderCards();renderModelList();feedback("provider-feedback","Disconnected "+provider+".","success");
}
async function sendMessage(e) {
  e.preventDefault();
  const input=document.querySelector("#message");
  const message=input.value.trim();
  if((!message&&!state.attachments.length)||state.busy)return;
  if(!state.selectedModel)return feedback("chat-feedback","Open Models & API, connect a provider, and select a model before sending.");
  if(!state.activeId)await newConversation();
  if(!state.activeId)return;
  state.busy=true;
  const area=document.querySelector("#conversation");
  const sentFiles=state.attachments.slice();
  area.innerHTML=`<div class="message user-message">${escapeHtml(message)}${sentFiles.map(x=>`<div class="file-chip">📎 ${escapeHtml(x.name)}</div>`).join("")}</div><div class="message assistant-message"><div class="typing"><i></i><i></i><i></i></div></div>`;
  input.value="";
  try{
    const {data,error}=await supabase.functions.invoke("chat",{body:{
      message,conversation_id:state.activeId,provider:state.selectedProvider,
      api_key:state.providerKeys[state.selectedProvider]&&state.providerKeys[state.selectedProvider]!=="__SERVER_GEMINI__"?state.providerKeys[state.selectedProvider]:undefined,
      model:state.selectedModel,
      agent_mode:state.agentMode,
      plugins:state.plugins.filter(x=>x.enabled).map(x=>x.plugin_id),
      attachments:sentFiles.map(x=>({name:x.name,type:x.type,path:x.path,text:x.text||""}))
    }});
    if(error||data?.error)throw new Error(data?.message||data?.error||error?.message||"Request failed.");
    area.innerHTML=`<div class="message user-message">${escapeHtml(message)}${sentFiles.map(x=>`<div class="file-chip">📎 ${escapeHtml(x.name)}</div>`).join("")}</div><div class="message assistant-message">${escapeHtml(data.message).replace(/\n/g,"<br>")}</div>`;
    for(const file of sentFiles)await supabase.storage.from("jarvis-user-files").remove([file.path]);
    state.attachments=[];renderAttachmentList();feedback("chat-feedback","", "success");
  }catch(err){
    const detail=err.message||"Connection problem. Please try again.";
    area.innerHTML+=`<div class="system-notice"><b>JARVIS STATUS</b><p>${escapeHtml(detail)}</p></div>`;
    feedback("chat-feedback",detail,"error");
  }finally{state.busy=false;area.scrollTop=area.scrollHeight;}
}

const PLUGIN_CATALOG=[
 {id:"web-search",name:"Web Search",description:"Search the live web with Google Search grounding when JARVIS uses a Gemini model.",category:"Research",status:"Available"},
 {id:"github",name:"GitHub",description:"Explore repositories, issues, and code.",category:"Development",status:"Coming soon"},
 {id:"google-drive",name:"Google Drive",description:"Connect documents and cloud files.",category:"Storage",status:"Coming soon"},
 {id:"gmail",name:"Gmail",description:"Find messages and prepare email drafts.",category:"Productivity",status:"Coming soon"},
 {id:"calendar",name:"Google Calendar",description:"Review and organize your schedule.",category:"Productivity",status:"Coming soon"}
];
async function loadSkills(){const {data,error}=await supabase.from("skills").select("*").order("created_at",{ascending:false});if(!error)state.skills=data||[];}
async function loadPlugins(){const {data,error}=await supabase.from("user_plugins").select("*");if(!error)state.plugins=data||[];}
async function loadProjects(){const {data,error}=await supabase.from("projects").select("*").order("updated_at",{ascending:false});if(!error)state.projects=data||[];}
async function logActivity(type,title,details=""){try{await supabase.from("activity_events").insert({user_id:state.user.id,event_type:type,title,details});}catch(e){console.warn("Activity log unavailable");}}
async function showWorkspaceView(view){
 state.view=view;
 const main=document.querySelector(".chat-area");
 const composer=document.querySelector(".composer-wrap");
 if(main)main.classList.toggle("workspace-mode",view!=="chat");
 if(composer)composer.hidden=view!=="chat";
 const label=document.querySelector(".topbar > div:first-child span:last-child");
 if(label)label.textContent="JARVIS SYSTEM · "+view.toUpperCase();
 const area=document.querySelector("#conversation");
 if(!area)return;
 document.querySelectorAll(".sidebar [id^='nav-']").forEach(b=>b.classList.toggle("active",b.id==="nav-"+view));
 if(view==="chat"){if(state.activeId)await loadMessages(state.activeId);else showWelcome();return;}
 if(view==="skills"){renderSkillsPage(area);return;}
 if(view==="plugins"){renderPluginsPage(area);return;}
 await renderWorkspacePage(view,area,{supabase,user:state.user,state,logActivity,escapeHtml,showView:showWorkspaceView,selectConversation});
}
function renderSkillsPage(area){
 area.innerHTML=`<div class="library-page"><div class="eyebrow">JARVIS CAPABILITIES</div><h1>Skills <em>Library</em></h1><p class="library-intro">Upload skill files or complete folders. Each file becomes an instruction set you can enable for your chats.</p><div class="library-actions"><label class="upload-skill">＋ Add skill files<input id="skill-files" type="file" hidden multiple accept=".md,.txt,.json"></label><label class="upload-skill secondary-upload">＋ Add skill folder<input id="skill-folder" type="file" hidden multiple webkitdirectory directory></label></div><div id="skills-feedback" class="feedback"></div><div class="library-grid">${state.skills.map(x=>`<article class="library-card"><div class="library-card-top"><span class="library-icon">✧</span><label class="toggle-line"><input type="checkbox" data-skill-toggle="${x.id}" ${x.enabled?"checked":""}> Enabled</label></div><h3>${escapeHtml(x.name)}</h3><p>${escapeHtml(x.description||"Uploaded skill instructions")}</p><div class="skill-file">${escapeHtml(x.file_path?.split("/").pop()||"Saved skill")}</div><button class="delete-skill" data-skill-delete="${x.id}">Remove skill</button></article>`).join("")||'<div class="empty-library">No skills yet. Add a .md, .txt, or .json skill file to get started.</div>'}</div></div>`;
 area.querySelector("#skill-files").addEventListener("change",e=>uploadSkillFiles([...e.target.files]));
 area.querySelector("#skill-folder").addEventListener("change",e=>uploadSkillFiles([...e.target.files]));
 area.querySelectorAll("[data-skill-toggle]").forEach(el=>el.addEventListener("change",async()=>{const {error}=await supabase.from("skills").update({enabled:el.checked}).eq("id",el.dataset.skillToggle);if(error)feedback("skills-feedback",error.message);else{await loadSkills();renderSkillsPage(area);}}));
 area.querySelectorAll("[data-skill-delete]").forEach(el=>el.addEventListener("click",async()=>{const skill=state.skills.find(x=>x.id===el.dataset.skillDelete);if(skill?.file_path)await supabase.storage.from("jarvis-user-files").remove([skill.file_path]);const {error}=await supabase.from("skills").delete().eq("id",el.dataset.skillDelete);if(error)feedback("skills-feedback",error.message);else{await loadSkills();renderSkillsPage(area);}}));
}
async function uploadSkillFiles(files){
 const area=document.querySelector("#conversation");const status=area.querySelector("#skills-feedback");
 for(const file of files){
  const ext=file.name.split(".").pop().toLowerCase();
  if(!["md","txt","json"].includes(ext)){status.textContent="Only .md, .txt, and .json skill files are supported.";continue;}
  if(file.size>1024*1024){status.textContent=file.name+" is larger than 1 MB.";continue;}
  const content=await file.text();let name=file.name.replace(/\.[^.]+$/,""),description="";
  try{if(ext==="json"){const parsed=JSON.parse(content);name=parsed.name||name;description=parsed.description||"";}}catch{status.textContent="Invalid JSON in "+file.name;continue;}
  const path=state.user.id+"/skills/"+crypto.randomUUID()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const upload=await supabase.storage.from("jarvis-user-files").upload(path,file,{upsert:false});
  if(upload.error){status.textContent=upload.error.message;continue;}
  const saved=await supabase.from("skills").insert({user_id:state.user.id,name,description,content,file_path:path,enabled:true});
  if(saved.error){await supabase.storage.from("jarvis-user-files").remove([path]);status.textContent=saved.error.message;}
 }
 await loadSkills();renderSkillsPage(area);
}
function renderPluginsPage(area){
 area.innerHTML=`<div class="library-page"><div class="eyebrow">EXTEND YOUR ASSISTANT</div><h1>Plugin <em>Store</em></h1><p class="library-intro">Enable real integrations for JARVIS. Web Search uses Gemini's built-in Google Search grounding; select a Gemini model in Models & API to use it.</p><div class="library-grid">${PLUGIN_CATALOG.map(p=>{const active=!!state.plugins.find(x=>x.plugin_id===p.id)?.enabled;const available=p.id==="web-search";return `<article class="library-card"><div class="library-card-top"><span class="plugin-category">${p.category}</span><span class="coming-soon">${available?(active?"ENABLED":"AVAILABLE"):p.status.toUpperCase()}</span></div><h3>${p.name}</h3><p>${p.description}</p><button class="plugin-toggle" data-plugin="${p.id}" ${available?"":"disabled"}>${available?(active?"Disable Web Search":"Enable Web Search"):"Coming soon"}</button></article>`;}).join("")}</div></div>`;
 area.querySelectorAll('[data-plugin="web-search"]').forEach(b=>b.addEventListener("click",()=>togglePlugin("web-search")));
}
async function togglePlugin(pluginId){
 const current=state.plugins.find(x=>x.plugin_id===pluginId);
 const enabled=!current?.enabled;
 let result;
 if(current){
  result=await supabase.from("user_plugins").update({enabled}).eq("id",current.id);
 }else{
  result=await supabase.from("user_plugins").insert({user_id:state.user.id,plugin_id:pluginId,enabled,settings:{}});
 }
 if(result.error){feedback("chat-feedback",result.error.message);return;}
 await loadPlugins();
 const area=document.querySelector("#conversation");
 if(area&&state.view==="plugins")renderPluginsPage(area);
 feedback("chat-feedback",enabled?"Web Search enabled. Choose a Gemini model to use it.":"Web Search disabled.","success");
}
async function handleChatFiles(event){
 const files=[...event.target.files];const allowed=["image/jpeg","image/png","image/webp","application/pdf","text/plain","text/markdown","application/json","text/javascript","text/css","text/html"];
 for(const file of files){
  if(!allowed.includes(file.type)&&!(/\.(md|js|ts|py|html|css|json)$/i.test(file.name))){feedback("chat-feedback","Unsupported file: "+file.name);continue;}
  if(file.size>20*1024*1024){feedback("chat-feedback",file.name+" exceeds 20 MB.");continue;}
  const path=state.user.id+"/chat/"+crypto.randomUUID()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const {error}=await supabase.storage.from("jarvis-user-files").upload(path,file,{upsert:false});
  if(error){feedback("chat-feedback",error.message);continue;}
  const textLike=file.type.startsWith("text/")||/\.(md|js|ts|py|html|css|json)$/i.test(file.name);
  const text=textLike?await file.text():"";
  state.attachments.push({name:file.name,type:file.type||"application/octet-stream",path,text:text.slice(0,100000)}); 
 }
 renderAttachmentList();event.target.value="";
}
function renderAttachmentList(){const root=document.querySelector("#attachment-list");if(!root)return;root.innerHTML=state.attachments.map((x,i)=>`<span class="file-chip">📎 ${escapeHtml(x.name)} <button type="button" data-remove-file="${i}">×</button></span>`).join("");root.querySelectorAll("[data-remove-file]").forEach(b=>b.addEventListener("click",async()=>{const item=state.attachments[Number(b.dataset.removeFile)];await supabase.storage.from("jarvis-user-files").remove([item.path]);state.attachments.splice(Number(b.dataset.removeFile),1);renderAttachmentList();}));}

async function boot() {
  render();
  if (!configured) return;
  const { data } = await supabase.auth.getSession();
  state.user = data.session?.user || null;
  if (state.user) await afterAuth();
  supabase.auth.onAuthStateChange((_event, session) => {
    state.user = session?.user || null;
    if (!state.user) { state.conversations=[]; state.activeId=null; state.providerKeys={}; state.models=[]; state.selectedProvider="gemini"; state.selectedModel=""; state.skills=[]; state.plugins=[]; state.attachments=[]; render(); }
  });
}
boot();
