import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const providers: Record<string, { base: string; kind: string }> = {
  openai: { base: "https://api.openai.com/v1", kind: "openai" },
  gemini: { base: "https://generativelanguage.googleapis.com/v1beta", kind: "gemini" },
  anthropic: { base: "https://api.anthropic.com/v1", kind: "anthropic" },
  deepseek: { base: "https://api.deepseek.com", kind: "compatible" },
  xai: { base: "https://api.x.ai/v1", kind: "compatible" },
  openrouter: { base: "https://openrouter.ai/api/v1", kind: "compatible" },
  groq: { base: "https://api.groq.com/openai/v1", kind: "compatible" },
  mistral: { base: "https://api.mistral.ai/v1", kind: "compatible" },
  together: { base: "https://api.together.xyz/v1", kind: "compatible" },
  perplexity: { base: "https://api.perplexity.ai", kind: "compatible" },
};
function authHeaders(provider: string, key: string): Record<string,string> {
  if (provider === "gemini") return { "x-goog-api-key": key };
  if (provider === "anthropic") return { "x-api-key": key, "anthropic-version": "2023-06-01" };
  return { "Authorization": "Bearer " + key };
}
async function getModels(provider: string, key: string) {
  const cfg = providers[provider];
  const response = await fetch(cfg.base + "/models", { headers: authHeaders(provider,key) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof result?.error?.message === "string" ? result.error.message : "";
    const reason = response.status === 401 || response.status === 403
      ? "The provider rejected this API key. Check the key and its permissions."
      : "Could not load models from this provider (" + response.status + "). " + detail.slice(0,160);
    throw new Error(reason);
  }
  let rows: Array<{id?:string}> = [];
  if (provider === "gemini") {
    rows = (result.models ?? [])
      .filter((m:any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m:any) => ({id:(String(m.name ?? "").startsWith("models/") ? String(m.name).slice(7) : String(m.name ?? ""))}));
  } else {
    rows = (result.data ?? []).map((m:any) => ({id:typeof m.id === "string" ? m.id : (typeof m.name === "string" ? m.name : "")}));
  }
  return rows.filter(m => typeof m.id === "string" && m.id.length > 0)
    .map(m => ({id:m.id!})).sort((a,b) => a.id.localeCompare(b.id));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({error:"method_not_allowed"},405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({error:"unauthorized"},401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serverGeminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!supabaseUrl || !anonKey) return json({error:"server_misconfigured"},500);

  const supabase = createClient(supabaseUrl,anonKey,{
    global:{headers:{Authorization:"Bearer "+token}},
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const {data:authData,error:authError}=await supabase.auth.getUser(token);
  if(authError||!authData.user)return json({error:"unauthorized"},401);
  const userId=authData.user.id;

  let body:{action?:unknown;provider?:unknown;api_key?:unknown;model?:unknown;message?:unknown;conversation_id?:unknown};
  try{body=await req.json();}catch{return json({error:"invalid_json"},400);}
  const provider=typeof body.provider==="string"?body.provider:"gemini";
  const cfg=providers[provider];
  if(!cfg)return json({error:"unsupported_provider",message:"This provider is not supported."},400);
  const suppliedKey=typeof body.api_key==="string"?body.api_key.trim():"";
  const key=suppliedKey||(provider==="gemini"?serverGeminiKey:"");

  if(body.action==="models"){
    if(key.length<8)return json({error:"api_key_required",message:"Enter an API key for this provider."},400);
    try{return json({models:await getModels(provider,key)});}
    catch(e){return json({error:"provider_models_error",message:e instanceof Error?e.message:"Could not load models."},400);}
  }

  if(typeof body.message!=="string"||!body.message.trim())return json({error:"message_required"},400);
  const message=body.message.trim();
  if(message.length>20000)return json({error:"message_too_long"},413);
  if(typeof body.conversation_id!=="string")return json({error:"conversation_id_required"},400);
  if(!key)return json({error:"provider_key_required",message:"Connect this provider in API Keys before sending a message."},400);
  const model=typeof body.model==="string"&&/^[a-zA-Z0-9._:/-]{1,180}$/.test(body.model)?body.model:"";
  if(!model)return json({error:"model_required",message:"Select a model from the connected provider's model list."},400);

  const {data:conversation,error:conversationError}=await supabase.from("conversations")
    .select("id").eq("id",body.conversation_id).eq("user_id",userId).maybeSingle();
  if(conversationError)return json({error:"conversation_lookup_failed"},500);
  if(!conversation)return json({error:"conversation_not_found"},404);

  const {error:userSaveError}=await supabase.from("messages").insert({
    conversation_id:conversation.id,user_id:userId,role:"user",content:message,
  });
  if(userSaveError)return json({error:"message_save_failed"},500);
  const {data:history,error:historyError}=await supabase.from("messages")
    .select("role,content").eq("conversation_id",conversation.id).eq("user_id",userId)
    .in("role",["user","assistant"]).order("created_at",{ascending:false}).limit(20);
  if(historyError)return json({error:"history_load_failed"},500);
  const ordered=(history??[]).reverse();

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),60000);
  let reply="";
  try{
    let response:Response;
    let result:any;
    if(cfg.kind==="openai"){
      response=await fetch(cfg.base+"/responses",{
        method:"POST",
        headers:{"Content-Type":"application/json",...authHeaders(provider,key)},
        body:JSON.stringify({
          model,
          instructions:"You are JARVIS, a helpful, clear, respectful personal AI assistant. Be honest about limitations and never claim an action was completed unless it was.",
          input:ordered.map(m=>({role:m.role==="assistant"?"assistant":"user",content:m.content})),
          store:false,max_output_tokens:2048,
        }),
        signal:controller.signal,
      });
      result=await response.json().catch(()=>({}));
      if(response.ok)reply=(result.output??[]).flatMap((item:any)=>item.content??[])
        .filter((part:any)=>part.type==="output_text").map((part:any)=>part.text??"").join("\n").trim();
    }else if(cfg.kind==="anthropic"){
      response=await fetch(cfg.base+"/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json",...authHeaders(provider,key)},
        body:JSON.stringify({
          model,max_tokens:2048,
          system:"You are JARVIS, a helpful, clear, respectful personal AI assistant. Be honest about limitations and never claim an action was completed unless it was.",
          messages:ordered.map(m=>({role:m.role==="assistant"?"assistant":"user",content:m.content})),
        }),
        signal:controller.signal,
      });
      result=await response.json().catch(()=>({}));
      if(response.ok)reply=(result.content??[]).filter((p:any)=>p.type==="text").map((p:any)=>p.text??"").join("\n").trim();
    }else if(cfg.kind==="gemini"){
      response=await fetch(cfg.base+"/models/"+encodeURIComponent(model)+":generateContent",{
        method:"POST",
        headers:{"Content-Type":"application/json",...authHeaders(provider,key)},
        body:JSON.stringify({
          systemInstruction:{parts:[{text:"You are JARVIS, a helpful, clear, respectful personal AI assistant. Be honest about limitations and never claim an action was completed unless it was."}]},
          contents:ordered.map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]})),
          generationConfig:{temperature:0.7,maxOutputTokens:2048},
        }),
        signal:controller.signal,
      });
      result=await response.json().catch(()=>({}));
      if(response.ok)reply=(result.candidates?.[0]?.content?.parts??[]).map((p:any)=>p.text??"").join("").trim();
    }else{
      response=await fetch(cfg.base+"/chat/completions",{
        method:"POST",
        headers:{"Content-Type":"application/json",...authHeaders(provider,key)},
        body:JSON.stringify({
          model,
          messages:[
            {role:"system",content:"You are JARVIS, a helpful, clear, respectful personal AI assistant. Be honest about limitations and never claim an action was completed unless it was."},
            ...ordered.map(m=>({role:m.role==="assistant"?"assistant":"user",content:m.content})),
          ],
          max_tokens:2048,
        }),
        signal:controller.signal,
      });
      result=await response.json().catch(()=>({}));
      if(response.ok)reply=result.choices?.[0]?.message?.content?.trim()??"";
    }
    if(!response.ok){
      clearTimeout(timeout);
      const status=response.status;
      const message=status===401||status===403
        ?"The provider rejected this key or model access. Check the key and model permissions."
        :status===429?"Provider rate limit or quota reached. Wait and try again."
        :"The provider could not complete the request ("+status+"). Check model access and API billing.";
      return json({error:"provider_request_failed",message},status===429?429:502);
    }
  }catch(e){
    clearTimeout(timeout);
    return json({error:"provider_unavailable",message:e instanceof Error&&e.name==="AbortError"?"The AI request timed out. Try again.":"The AI provider could not be reached. Please try again."},502);
  }
  clearTimeout(timeout);
  if(!reply)return json({error:"empty_provider_response",message:"The provider returned an empty response."},502);

  const {error:assistantSaveError}=await supabase.from("messages").insert({
    conversation_id:conversation.id,user_id:userId,role:"assistant",content:reply,
  });
  if(assistantSaveError)return json({error:"assistant_save_failed",message:reply},500);
  await supabase.from("conversations").update({updated_at:new Date().toISOString()})
    .eq("id",conversation.id).eq("user_id",userId);
  return json({message:reply,conversation_id:conversation.id});
});
