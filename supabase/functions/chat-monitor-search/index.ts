import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response(405, { error: "METHOD_NOT_ALLOWED" });
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return response(500, { error: "SERVER_CONFIGURATION_ERROR" });
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return response(401, { error: "UNAUTHENTICATED" });
  const jwt = auth.slice(7);
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: "Bearer " + jwt } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !user) return response(401, { error: "UNAUTHENTICATED" });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: roles, error: roleError } = await admin.from("admin_user_roles").select("role_id").eq("user_id", user.id).is("disabled_at", null);
  if (roleError) return response(500, { error: "AUTHORIZATION_LOOKUP_FAILED" });
  const roleIds = (roles ?? []).map((r) => r.role_id);
  if (!roleIds.length) return response(403, { error: "PERMISSION_DENIED" });
  const { data: permissionRows, error: permissionError } = await admin.from("role_permissions").select("permission_id").in("role_id", roleIds);
  if (permissionError) return response(500, { error: "AUTHORIZATION_LOOKUP_FAILED" });
  const permissions = new Set((permissionRows ?? []).map((p) => p.permission_id));
  if (!permissions.has("messages.view")) return response(403, { error: "PERMISSION_DENIED" });

  let input: { conversationId?: string; userId?: string; keyword?: string; from?: string; to?: string; messageType?: string; includeMedia?: boolean; limit?: number };
  try { input = await req.json(); } catch { return response(400, { error: "INVALID_JSON" }); }
  const isSearch = Boolean(input.keyword || input.userId || input.from || input.to || input.messageType);
  if (isSearch && !permissions.has("messages.search")) return response(403, { error: "SEARCH_PERMISSION_REQUIRED" });
  if (input.includeMedia && !permissions.has("messages.media_view")) return response(403, { error: "MEDIA_PERMISSION_REQUIRED" });
  if (input.conversationId && !/^[0-9a-f-]{36}$/i.test(input.conversationId)) return response(400, { error: "INVALID_CONVERSATION_ID" });
  if (input.userId && !/^[0-9a-f-]{36}$/i.test(input.userId)) return response(400, { error: "INVALID_USER_ID" });
  if (input.from && Number.isNaN(Date.parse(input.from))) return response(400, { error: "INVALID_FROM_DATE" });
  if (input.to && Number.isNaN(Date.parse(input.to))) return response(400, { error: "INVALID_TO_DATE" });
  const limit = Math.min(Math.max(Number.isInteger(input.limit) ? Number(input.limit) : 50, 1), 100);
  const allowedTypes = ["text","image","voice","gif","system","gift","file"];
  if (input.messageType && !allowedTypes.includes(input.messageType)) return response(400, { error: "INVALID_MESSAGE_TYPE" });

  // Log the review before returning any message content. Do not store message bodies in audit logs.
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "chat_monitor.read",
    target_type: input.conversationId ? "conversation" : "message_search",
    target_id: input.conversationId ?? null,
    after_data: {
      filters: {
        user_id: input.userId ?? null, keyword_used: Boolean(input.keyword),
        from: input.from ?? null, to: input.to ?? null,
        message_type: input.messageType ?? null, include_media: Boolean(input.includeMedia), limit,
      },
    },
  });
  if (auditError) return response(500, { error: "AUDIT_LOG_FAILED" });

  let query = admin.from("messages").select("id,conversation_id,sender_id,message_type,body,attachment_path,reply_to,edited_at,deleted_at,created_at")
    .order("created_at", { ascending: false }).limit(limit);
  if (input.conversationId) query = query.eq("conversation_id", input.conversationId);
  if (input.userId) query = query.eq("sender_id", input.userId);
  if (input.keyword) query = query.ilike("body", "%" + input.keyword.replace(/[%_]/g, "") + "%");
  if (input.from) query = query.gte("created_at", input.from);
  if (input.to) query = query.lte("created_at", input.to);
  if (input.messageType) query = query.eq("message_type", input.messageType);
  const { data: rows, error: queryError } = await query;
  if (queryError) return response(500, { error: "MESSAGE_QUERY_FAILED" });
  const messages = rows ?? [];
  const senderIds = [...new Set(messages.map((m) => m.sender_id))];
  const conversationIds = [...new Set(messages.map((m) => m.conversation_id))];
  const [profilesResult, conversationsResult] = await Promise.all([
    senderIds.length ? admin.from("profiles").select("id,public_id,display_name,avatar_url").in("id", senderIds) : Promise.resolve({data:[],error:null}),
    conversationIds.length ? admin.from("conversations").select("id,kind,title").in("id", conversationIds) : Promise.resolve({data:[],error:null}),
  ]);
  if (profilesResult.error || conversationsResult.error) return response(500, { error: "MESSAGE_METADATA_QUERY_FAILED" });
  const profiles = new Map((profilesResult.data ?? []).map((p) => [p.id,p]));
  const conversations = new Map((conversationsResult.data ?? []).map((c) => [c.id,c]));
  const result = messages.map((m) => ({
    ...m,
    attachment_path: permissions.has("messages.media_view") && input.includeMedia ? m.attachment_path : null,
    sender: profiles.get(m.sender_id) ?? null,
    conversation: conversations.get(m.conversation_id) ?? null,
  }));
  return response(200, { data: result, count: result.length, limit });
});
