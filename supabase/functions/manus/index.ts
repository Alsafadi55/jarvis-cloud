import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"method_not_allowed",message:"Use POST."},405);
  const url=Deno.env.get("SUPABASE_URL")??"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")??Deno.env.get("SUPABASE_PUBLISHABLE_KEY")??"";
  const authorization=req.headers.get("Authorization")??"";
  if(!url||!anon||!authorization)return json({error:"unauthorized",message:"Sign in to JARVIS first."},401);
  const supabase=createClient(url,anon,{global:{headers:{Authorization:authorization}}});
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)return json({error:"unauthorized",message:"Your JARVIS session is invalid. Sign in again."},401);
  let body:any;
  try{body=await req.json();}catch{return json({error:"invalid_json",message:"Invalid request body."},400);}
  const key=typeof body.api_key==="string"?body.api_key.trim():"";
  if(key.length<20||key.length>500)return json({error:"invalid_key",message:"Enter a valid Manus API key."},400);
  if(body.action!=="test")return json({error:"unsupported_action",message:"Unsupported Manus action."},400);
  try{
    const response=await fetch("https://api.manus.ai/v2/user.me",{method:"GET",headers:{"x-manus-api-key":key},signal:AbortSignal.timeout(15000)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||result?.ok!==true){
      const status=response.status===401||response.status===403?401:response.status===429?429:502;
      const message=status===401?"Manus rejected this API key. Check it and try again.":status===429?"Manus rate limit reached. Wait a moment and try again.":"Manus could not verify the connection. Try again later.";
      return json({error:"manus_connection_failed",message},status);
    }
    return json({ok:true,connected:true,user_id:typeof result.user_id==="string"?result.user_id:null});
  }catch{
    return json({error:"manus_unreachable",message:"Could not reach Manus. Check the connection and try again."},502);
  }
});