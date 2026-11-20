import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("Supabase environment is missing required configuration.");
    return json({ error: "server_misconfigured" }, 500);
  }

  // This client carries the caller's JWT so every query remains subject to RLS.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "unauthorized" }, 401);
  const userId = authData.user.id;

  let body: { message?: unknown; conversation_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return json({ error: "message_required" }, 400);
  }
  if (body.message.length > 20000) return json({ error: "message_too_long" }, 413);

  if (body.conversation_id !== undefined) {
    if (typeof body.conversation_id !== "string") {
      return json({ error: "invalid_conversation_id" }, 400);
    }
    const { data: conversation, error } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", body.conversation_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Conversation lookup failed:", error.message);
      return json({ error: "conversation_lookup_failed" }, 500);
    }
    if (!conversation) return json({ error: "conversation_not_found" }, 404);
  }

  // Provider routing and message persistence are intentionally disabled until
  // server-side provider credentials and the provider adapter are configured.
  return json({
    error: "provider_not_configured",
    message: "Authentication and request validation succeeded. Configure an AI provider to enable chat.",
    conversation_id: body.conversation_id ?? null,
  }, 503);
});
