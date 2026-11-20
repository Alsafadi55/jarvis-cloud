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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "server_misconfigured" }, 500);
  if (!geminiKey) return json({ error: "provider_not_configured", message: "Gemini is not configured on the server." }, 503);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "unauthorized" }, 401);
  const userId = authData.user.id;

  let body: { message?: unknown; conversation_id?: unknown };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (typeof body.message !== "string" || !body.message.trim()) return json({ error: "message_required" }, 400);
  const message = body.message.trim();
  if (message.length > 20000) return json({ error: "message_too_long" }, 413);
  if (typeof body.conversation_id !== "string") return json({ error: "conversation_id_required" }, 400);

  const { data: conversation, error: conversationError } = await supabase.from("conversations")
    .select("id").eq("id", body.conversation_id).eq("user_id", userId).maybeSingle();
  if (conversationError) {
    console.error("Conversation lookup failed:", conversationError.message);
    return json({ error: "conversation_lookup_failed" }, 500);
  }
  if (!conversation) return json({ error: "conversation_not_found" }, 404);

  const { error: userSaveError } = await supabase.from("messages").insert({
    conversation_id: conversation.id, user_id: userId, role: "user", content: message,
  });
  if (userSaveError) {
    console.error("User message save failed:", userSaveError.message);
    return json({ error: "message_save_failed" }, 500);
  }

  const { data: history, error: historyError } = await supabase.from("messages")
    .select("role,content").eq("conversation_id", conversation.id).eq("user_id", userId)
    .in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(20);
  if (historyError) {
    console.error("History load failed:", historyError.message);
    return json({ error: "history_load_failed" }, 500);
  }
  const contents = (history ?? []).reverse().map((item) => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.content }],
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "You are JARVIS, a helpful, clear, respectful personal AI assistant. Be honest about limitations and never claim an action was completed unless it was." }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    console.error("Gemini request failed:", error instanceof Error ? error.name : "unknown");
    return json({ error: "provider_unavailable", message: "Gemini could not be reached. Please try again." }, 502);
  }
  clearTimeout(timeout);

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Gemini HTTP error:", response.status, result?.error?.status ?? "unknown");
    return json({
      error: response.status === 429 ? "provider_rate_limited" : "provider_error",
      message: response.status === 429
        ? "Gemini is temporarily rate-limited. Please wait and try again."
        : "Gemini returned an error. Check the API key and model access in Google AI Studio.",
    }, response.status === 429 ? 429 : 502);
  }

  const reply = (result?.candidates?.[0]?.content?.parts ?? [])
    .map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!reply) return json({ error: "empty_provider_response", message: "Gemini returned an empty response. Please try again." }, 502);

  const { error: assistantSaveError } = await supabase.from("messages").insert({
    conversation_id: conversation.id, user_id: userId, role: "assistant", content: reply,
  });
  if (assistantSaveError) {
    console.error("Assistant message save failed:", assistantSaveError.message);
    return json({ error: "assistant_save_failed", message: reply }, 500);
  }
  await supabase.from("conversations").update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id).eq("user_id", userId);
  return json({ message: reply, conversation_id: conversation.id });
});