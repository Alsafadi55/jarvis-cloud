import { createClient } from "@supabase/supabase-js";
import "./style.css";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes("YOUR_PROJECT") && !SUPABASE_ANON_KEY.includes("YOUR_"));
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const state = { user: null, conversations: [], activeId: null, busy: false, apiKey: "", models: [], selectedModel: "", providerConnected: false };
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
  app.innerHTML = `<div class="workspace"><aside class="sidebar"><div class="brand"><div class="brand-mark">${icon("spark")}</div><span>JARVIS<span class="muted"> CLOUD</span></span></div><button class="new-chat" id="new-chat">${icon("plus")} New conversation</button><div class="side-label">YOUR HISTORY</div><div class="history" id="history">${state.conversations.map(c => `<button class="history-item ${c.id===state.activeId?"active":""}" data-id="${c.id}">${escapeHtml(c.title || "New conversation")}</button>`).join("") || '<div class="empty-history">Your conversations will appear here.</div>'}</div><div class="profile"><div class="avatar">${escapeHtml((state.user.email||"J").slice(0,1).toUpperCase())}</div><div class="profile-info"><b>${escapeHtml(state.user.email || "JARVIS user")}</b><span>Connected account</span></div><button class="icon-button" id="logout" aria-label="Sign out">${icon("logout")}</button></div></aside><main class="chat-area"><header class="topbar"><div><span class="online-dot"></span><span>JARVIS SYSTEM</span></div><div class="topbar-actions"><span class="secure-label">PRIVATE SESSION</span><button class="models-toggle" id="open-models" type="button">Models & API <span>↗</span></button></div></header><section class="conversation" id="conversation"><div class="welcome"><div class="welcome-orb">${icon("spark")}</div><div class="eyebrow">YOUR PERSONAL AI</div><h1>What can I help you<br><em>with today?</em></h1><p>Your cloud workspace is connected. Start a conversation with JARVIS.</p><div class="suggestions"><button data-prompt="Help me organize my projects">Organize my projects <span>↗</span></button><button data-prompt="Explain how JARVIS Cloud works">Explain JARVIS Cloud <span>↗</span></button><button data-prompt="Help me plan my next week">Plan my week <span>↗</span></button></div></div></section><div class="composer-wrap"><div id="chat-feedback" class="chat-feedback" role="status"></div><form class="composer" id="chat-form"><textarea id="message" rows="1" placeholder="Message JARVIS..." maxlength="20000" required></textarea><button class="send-button" type="submit" aria-label="Send message">${icon("send")}</button></form><div class="composer-hint">JARVIS can make mistakes. Verify important information.</div></div></main><aside class="models-drawer" id="models-drawer"><div class="drawer-head"><div><div class="eyebrow">MODEL SETTINGS</div><h2>Connect provider</h2></div><button class="icon-button" id="close-models" aria-label="Close">×</button></div><label class="api-label" for="openai-key">OpenAI API key</label><input class="api-key-input" id="openai-key" type="password" autocomplete="off" placeholder="Paste your API key here"><button class="primary connect-button" id="connect-openai" type="button">Connect & load models</button><div class="key-note">Your key stays in this browser tab memory and is sent securely to JARVIS only when needed. It is not saved to the database. Re-enter it after refreshing.</div><div id="provider-feedback" class="feedback" role="status"></div><div class="model-list-head"><span>AVAILABLE MODELS</span><button id="refresh-models" type="button">Refresh</button></div><div id="model-list"><div class="empty-history">Connect your API key to load available models.</div></div><button class="secondary disconnect-button" id="disconnect-openai" type="button">Disconnect OpenAI</button></aside></div>`;
  document.querySelector("#logout").addEventListener("click", signOut);
  document.querySelector("#open-models").addEventListener("click", () => document.querySelector("#models-drawer").classList.add("open"));
  document.querySelector("#close-models").addEventListener("click", () => document.querySelector("#models-drawer").classList.remove("open"));
  document.querySelector("#connect-openai").addEventListener("click", connectOpenAI);
  document.querySelector("#refresh-models").addEventListener("click", refreshOpenAIModels);
  document.querySelector("#disconnect-openai").addEventListener("click", disconnectOpenAI);
  const modelList = document.querySelector("#model-list");
  if (modelList) {
    modelList.innerHTML = state.models.length ? state.models.map(m => '<button class="model-option '+(m.id===state.selectedModel?'selected':'')+'" data-model="'+escapeHtml(m.id)+'"><b>'+escapeHtml(m.id)+'</b><span>'+(m.id===state.selectedModel?'Selected':'OpenAI model')+'</span></button>').join("") : '<div class="empty-history">Connect your API key to load available models.</div>';
    modelList.querySelectorAll("[data-model]").forEach(b => b.addEventListener("click", () => {
      state.selectedModel = b.dataset.model;
      modelList.querySelectorAll(".model-option").forEach(el => { el.classList.toggle("selected", el.dataset.model===state.selectedModel); el.querySelector("span").textContent = el.dataset.model===state.selectedModel ? "Selected" : "OpenAI model"; });
    }));
  }

  document.querySelector("#new-chat").addEventListener("click", newConversation);
  document.querySelector("#chat-form").addEventListener("submit", sendMessage);
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
async function signOut() { await supabase.auth.signOut(); state.user = null; state.conversations = []; state.activeId = null; state.apiKey = ""; state.models = []; state.selectedModel = ""; state.providerConnected = false; render(); }
async function afterAuth() { await loadConversations(); render(); if (state.activeId) await loadMessages(state.activeId); }
async function loadConversations() {
  const { data, error } = await supabase.from("conversations").select("id,title,updated_at").order("updated_at", { ascending:false }).limit(50);
  if (error) { console.error(error); return; }
  state.conversations = data || [];
  state.activeId = state.conversations[0]?.id || null;
}
async function newConversation() {
  const { data, error } = await supabase.from("conversations").insert({ user_id: state.user.id, title:"New conversation" }).select("id,title,updated_at").single();
  if (error) return feedback("chat-feedback", error.message);
  state.conversations.unshift(data); state.activeId = data.id; render();
}
async function selectConversation(id) { state.activeId = id; render(); await loadMessages(id); }
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
async function connectOpenAI() {
  const key = document.querySelector("#openai-key").value.trim();
  if (!key) return feedback("provider-feedback", "Paste your OpenAI API key first.");
  const btn = document.querySelector("#connect-openai"); btn.disabled = true; btn.textContent = "Checking key...";
  try {
    const { data, error } = await supabase.functions.invoke("chat", { body: { action:"models", provider:"openai", api_key:key } });
    if (error || data?.error) throw new Error(data?.message || data?.error || error?.message || "Could not load models.");
    state.apiKey = key; state.models = data.models || []; state.selectedModel = state.models[0]?.id || ""; state.providerConnected = true;
    render(); document.querySelector("#models-drawer").classList.add("open"); feedback("provider-feedback", "Connected. Choose a model from the list.", "success");
  } catch (err) { feedback("provider-feedback", err.message || "Connection failed."); }
  finally { const b=document.querySelector("#connect-openai"); if(b){b.disabled=false;b.textContent="Connect & load models";} }
}
async function refreshOpenAIModels() {
  if (!state.apiKey) return feedback("provider-feedback", "Connect your API key first.");
  const { data, error } = await supabase.functions.invoke("chat", { body: { action:"models", provider:"openai", api_key:state.apiKey } });
  if (error || data?.error) return feedback("provider-feedback", data?.message || error?.message || "Could not refresh models.");
  state.models = data.models || []; if (!state.models.some(m=>m.id===state.selectedModel)) state.selectedModel=state.models[0]?.id || "";
  render(); document.querySelector("#models-drawer").classList.add("open");
}
function disconnectOpenAI() { state.apiKey=""; state.models=[]; state.selectedModel=""; state.providerConnected=false; render(); }
async function sendMessage(e) {
  e.preventDefault();
  const input = document.querySelector("#message");
  const message = input.value.trim();
  if (!message || state.busy) return;
  if (!state.activeId) await newConversation();
  if (!state.activeId) return;
  state.busy = true;
  const area = document.querySelector("#conversation");
  area.innerHTML = `<div class="message user-message">${escapeHtml(message)}</div><div class="message assistant-message"><div class="typing"><i></i><i></i><i></i></div></div>`;
  input.value = "";
  try {
    const { data, error } = await supabase.functions.invoke("chat", { body: { message, conversation_id:state.activeId, provider:state.apiKey ? "openai" : "gemini", api_key:state.apiKey || undefined, model:state.selectedModel || undefined } });
    state.busy = false;
    if (error || data?.error) {
      const detail = data?.message || data?.error || error?.message || "Request failed.";
      area.innerHTML += `<div class="system-notice"><b>JARVIS STATUS</b><p>${escapeHtml(detail)}</p></div>`;
      feedback("chat-feedback", detail, "error");
    } else {
      area.innerHTML = `<div class="message user-message">${escapeHtml(message)}</div><div class="message assistant-message">${escapeHtml(data.message).replace(/\\n/g, "<br>")}</div>`;
    }
  } catch {
    state.busy = false;
    const detail = "Connection problem. Please try again.";
    area.innerHTML += `<div class="system-notice"><p>${detail}</p></div>`;
    feedback("chat-feedback", detail, "error");
  }
  area.scrollTop = area.scrollHeight;
}
async function boot() {
  render();
  if (!configured) return;
  const { data } = await supabase.auth.getSession();
  state.user = data.session?.user || null;
  if (state.user) await afterAuth();
  supabase.auth.onAuthStateChange((_event, session) => {
    state.user = session?.user || null;
    if (!state.user) { state.conversations=[]; state.activeId=null; render(); }
  });
}
boot();
