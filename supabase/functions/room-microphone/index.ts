import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { RoomServiceClient } from "npm:livekit-server-sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = (req.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!auth) return json({ error: "Authentication required" }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const livekitUrl = Deno.env.get("LIVEKIT_URL");
  const livekitKey = Deno.env.get("LIVEKIT_API_KEY");
  const livekitSecret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!url || !anon || !service || !livekitUrl || !livekitKey || !livekitSecret) {
    return json({ error: "Voice moderation is not configured" }, 503);
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: "Bearer " + auth[1] } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser(auth[1]);
  if (authError || !user) return json({ error: "Invalid or expired session" }, 401);

  let payload: { requestId?: unknown; accept?: unknown; action?: unknown; roomId?: unknown; targetUserId?: unknown };
  try { payload = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  // Room moderation must update LiveKit as well as the database; otherwise a
  // muted/kicked participant can keep publishing audio on an existing connection.
  if (typeof payload.action === "string") {
    if (!["lower", "mute", "kick", "ban"].includes(payload.action)
      || typeof payload.roomId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.roomId)
      || typeof payload.targetUserId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.targetUserId)) {
      return json({ error: "Invalid room moderation action" }, 400);
    }
    const rpcName = payload.action === "lower" ? "jehoo_lower_from_seat"
      : payload.action === "mute" ? "jehoo_mute_room_member"
      : payload.action === "kick" ? "jehoo_kick_from_room" : "jehoo_ban_from_room";
    const rpcArgs: Record<string, unknown> = {
      p_room_id: payload.roomId,
      p_target_user_id: payload.targetUserId,
    };
    if (payload.action === "mute") rpcArgs.p_muted = true;
    if (payload.action === "ban") rpcArgs.p_reason = "إدارة الغرفة";
    const { data: moderationResult, error: moderationError } = await userClient.rpc(rpcName, rpcArgs);
    if (moderationError) {
      const status = moderationError.code === "42501" ? 403 : moderationError.code === "P0002" ? 404 : 400;
      return json({ error: moderationError.message || "Unable to moderate room member" }, status);
    }

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: room, error: roomError } = await admin.from("rooms")
      .select("livekit_room_name").eq("id", payload.roomId).maybeSingle();
    if (roomError || !room?.livekit_room_name) {
      return json({ ok: true, result: moderationResult, livekitAction: "next-token" });
    }
    try {
      const livekit = new RoomServiceClient(livekitUrl, livekitKey, livekitSecret);
      const participants = await livekit.listParticipants(room.livekit_room_name);
      if (!participants.some((participant) => participant.identity === payload.targetUserId)) {
        return json({ ok: true, result: moderationResult, livekitAction: "next-token" });
      }
      if (payload.action === "kick" || payload.action === "ban") {
        await livekit.removeParticipant(room.livekit_room_name, payload.targetUserId);
      } else {
        await livekit.updateParticipant(room.livekit_room_name, payload.targetUserId, {
          permission: { canPublish: false, canSubscribe: true, canPublishData: true },
        });
      }
      return json({ ok: true, result: moderationResult, livekitAction: "updated" });
    } catch (_error) {
      try {
        const livekit = new RoomServiceClient(livekitUrl, livekitKey, livekitSecret);
        await livekit.updateParticipant(room.livekit_room_name, payload.targetUserId, {
          permission: { canPublish: false, canSubscribe: true, canPublishData: true },
        });
      } catch {}
      return json({ ok: true, result: moderationResult, livekitAction: "refresh-required" });
    }
  }

  if (typeof payload.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.requestId) || typeof payload.accept !== "boolean") {
    return json({ error: "Invalid microphone decision" }, 400);
  }

  const { data: result, error: rpcError } = await userClient.rpc("jehoo_handle_microphone_request", {
    p_request_id: payload.requestId,
    p_accept: payload.accept,
  });
  if (rpcError) {
    const status = rpcError.code === "42501" ? 403 : rpcError.code === "P0002" ? 404 : 400;
    return json({ error: rpcError.message || "Unable to process request" }, status);
  }

  if (payload.accept) {
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: request, error: requestError } = await admin.from("room_requests")
      .select("user_id,room_id").eq("id", payload.requestId).maybeSingle();
    if (requestError || !request) return json({ ok: true, result, livekitPermission: "pending" });
    const { data: room, error: roomError } = await admin.from("rooms")
      .select("livekit_room_name").eq("id", request.room_id).maybeSingle();
    if (roomError || !room?.livekit_room_name) return json({ ok: true, result, livekitPermission: "pending" });

    try {
      const livekit = new RoomServiceClient(livekitUrl, livekitKey, livekitSecret);
      const participants = await livekit.listParticipants(room.livekit_room_name);
      if (participants.some((participant) => participant.identity === request.user_id)) {
        await livekit.updateParticipant(room.livekit_room_name, request.user_id, {
          permission: { canPublish: true, canSubscribe: true, canPublishData: true },
        });
        return json({ ok: true, result, livekitPermission: "updated" });
      }
      // Not connected yet: the next token request will include the speaker role.
      return json({ ok: true, result, livekitPermission: "next-token" });
    } catch (_error) {
      // The database decision is durable; a reconnect/token refresh can recover the permission.
      return json({ ok: true, result, livekitPermission: "refresh-required" });
    }
  }

  return json({ ok: true, result });
});
