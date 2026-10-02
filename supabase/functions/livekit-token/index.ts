import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk";

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

  const match = (req.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "Missing bearer token" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const livekitUrl = Deno.env.get("LIVEKIT_URL");
  const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
  const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!supabaseUrl || !supabaseAnonKey || !livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return json({ error: "Voice service is not configured" }, 503);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: "Bearer " + match[1] } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser(match[1]);
    if (authError || !user) return json({ error: "Invalid or expired session" }, 401);

    const payload = await req.json().catch(() => null);
    const roomName = typeof payload?.roomName === "string" ? payload.roomName.trim() : "";
    if (!roomName || roomName.length > 160) return json({ error: "Invalid room name" }, 400);

    const { data: room, error: roomError } = await supabase.from("rooms")
      .select("id,name,livekit_room_name,status,owner_id")
      .eq("livekit_room_name", roomName).maybeSingle();
    if (roomError) return json({ error: "Room lookup failed" }, 500);
    if (!room || room.status === "closed") return json({ error: "Room is unavailable" }, 404);

    const { data: ban, error: banError } = await supabase.from("room_bans")
      .select("user_id,expires_at").eq("room_id", room.id).eq("user_id", user.id).maybeSingle();
    if (banError) return json({ error: "Room authorization failed" }, 500);
    if (ban && (!ban.expires_at || new Date(ban.expires_at).getTime() > Date.now())) {
      return json({ error: "You are banned from this room" }, 403);
    }

    const { data: membership, error: memberError } = await supabase.from("room_members")
      .select("room_role,muted").eq("room_id", room.id).eq("user_id", user.id).maybeSingle();
    if (memberError) return json({ error: "Room authorization failed" }, 500);
    const role = user.id === room.owner_id ? "host" : membership?.room_role ?? "listener";
    if (room.status === "locked" && !["host","co_host","moderator"].includes(role)) {
      return json({ error: "Room is locked" }, 403);
    }

    const canPublish = ["host","co_host","moderator","speaker"].includes(role) && !membership?.muted;
    const token = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      ttl: "10m",
      name: typeof user.user_metadata?.display_name === "string"
        ? user.user_metadata.display_name.slice(0, 80)
        : typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name.slice(0, 80)
          : "JEHOO user",
    });
    token.addGrant({ roomJoin: true, room: roomName, canPublish, canSubscribe: true, canPublishData: true });
    return json({ serverUrl: livekitUrl, participantToken: await token.toJwt(), roomId: room.id, role, canPublish });
  } catch (_error) {
    return json({ error: "Unable to issue room token" }, 500);
  }
});
