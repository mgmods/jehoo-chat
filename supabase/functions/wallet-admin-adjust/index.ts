import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-idempotency-key",
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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return response(401, { error: "UNAUTHENTICATED" });
  const jwt = authHeader.slice("Bearer ".length);
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: "Bearer " + jwt } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !user) return response(401, { error: "UNAUTHENTICATED" });

  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: roles, error: rolesError } = await adminClient.from("admin_user_roles")
    .select("role_id").eq("user_id", user.id).is("disabled_at", null);
  if (rolesError) return response(500, { error: "AUTHORIZATION_LOOKUP_FAILED" });
  const roleIds = (roles ?? []).map((row) => row.role_id);
  if (!roleIds.length) return response(403, { error: "PERMISSION_DENIED" });
  const { data: permissionRows, error: permissionError } = await adminClient.from("role_permissions")
    .select("permission_id").in("role_id", roleIds).eq("permission_id", "wallet.adjust");
  if (permissionError) return response(500, { error: "AUTHORIZATION_LOOKUP_FAILED" });
  if (!permissionRows?.length) return response(403, { error: "PERMISSION_DENIED" });

  let payload: { userId?: string; amount?: number; reason?: string; idempotencyKey?: string };
  try { payload = await req.json(); } catch { return response(400, { error: "INVALID_JSON" }); }
  if (typeof payload.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.userId)) return response(400, { error: "INVALID_USER_ID" });
  if (!Number.isSafeInteger(payload.amount) || !payload.amount || Math.abs(payload.amount) > 1000000000) return response(400, { error: "INVALID_AMOUNT" });
  if (typeof payload.reason !== "string" || payload.reason.trim().length < 5 || payload.reason.length > 500) return response(400, { error: "REASON_REQUIRED" });
  const idem = payload.idempotencyKey ?? req.headers.get("x-idempotency-key") ?? "";
  if (typeof idem !== "string" || idem.length < 8 || idem.length > 160) return response(400, { error: "IDEMPOTENCY_KEY_REQUIRED" });

  const { data, error } = await adminClient.rpc("jehoo_apply_wallet_adjustment", {
    p_actor_id: user.id,
    p_user_id: payload.userId,
    p_amount: payload.amount,
    p_idempotency_key: idem,
    p_reason: payload.reason.trim(),
  });
  if (error) {
    const safeMessage = error.message.includes("INSUFFICIENT_COINS") ? "INSUFFICIENT_COINS"
      : error.message.includes("WALLET_NOT_FOUND") ? "WALLET_NOT_FOUND"
      : error.message.includes("IDEMPOTENCY") ? "INVALID_IDEMPOTENCY_KEY"
      : error.message.includes("REASON_REQUIRED") ? "REASON_REQUIRED" : "WALLET_ADJUSTMENT_FAILED";
    return response(400, { error: safeMessage });
  }
  return response(200, { ok: true, result: data });
});
