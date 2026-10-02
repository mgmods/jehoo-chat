import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { AudioSession, LiveKitRoom } from "@livekit/react-native";
import { supabase } from "@/lib/supabase";

type RoomRow = { id:string; name:string; description:string; status:"active"|"locked"|"closed"; owner_id:string; livekit_room_name:string };
type SeatRow = { room_id:string; seat_number:number; status:"empty"|"occupied"|"locked"|"reserved"; user_id:string|null; reserved_for:string|null };
type ProfileRow = { id:string; display_name:string; avatar_url:string; level:number; vip_level:number };
type MicRequestRow = { id:string; user_id:string; created_at:string; profiles?:{display_name:string}|null };

export default function VoiceRoomRoute() {
  const params = useLocalSearchParams<{id:string}>();
  const router = useRouter();
  const roomId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [room, setRoom] = useState<RoomRow|null>(null);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string,ProfileRow>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<{url:string;token:string}|null>(null);
  const [error, setError] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [micRequestBusy, setMicRequestBusy] = useState(false);
  const [micRequestSent, setMicRequestSent] = useState(false);
  const [pendingMicRequests, setPendingMicRequests] = useState<MicRequestRow[]>([]);
  const [handlingRequest, setHandlingRequest] = useState<string|null>(null);

  const loadRoom = useCallback(async () => {
    if (!supabase || !roomId) { setError("Supabase or room ID is missing."); setLoading(false); return; }
    setError("");
    const { data: roomData, error: roomError } = await supabase.from("rooms")
      .select("id,name,description,status,owner_id,livekit_room_name").eq("id",roomId).maybeSingle();
    if (roomError || !roomData) { setError(roomError?.message ?? "Room not found."); setLoading(false); return; }
    setRoom(roomData as RoomRow);
    const { data: seatData, error: seatError } = await supabase.from("room_seats")
      .select("room_id,seat_number,status,user_id,reserved_for").eq("room_id",roomId).order("seat_number");
    if (seatError) { setError(seatError.message); setLoading(false); return; }
    const seatRows = (seatData ?? []) as SeatRow[];
    setSeats(seatRows);
    const ids = [...new Set(seatRows.flatMap((seat) => [seat.user_id,seat.reserved_for]).filter((id): id is string => Boolean(id)))];
    if (ids.length) {
      const { data: profileRows, error: profileError } = await supabase.from("profiles")
        .select("id,display_name,avatar_url,level,vip_level").in("id",ids);
      if (profileError) { setError(profileError.message); setLoading(false); return; }
      const map: Record<string,ProfileRow> = {};
      (profileRows ?? []).forEach((p) => { map[p.id] = p as ProfileRow; });
      setProfiles(map);
    } else setProfiles({});
    const { data: { user } } = await supabase.auth.getUser();
    const host = Boolean(user && user.id === roomData.owner_id);
    setIsHost(host);
    if (host) {
      const { data: requests } = await supabase.from("room_requests")
        .select("id,user_id,created_at,profiles(display_name)")
        .eq("room_id", roomId).eq("request_type", "microphone").eq("status", "pending")
        .order("created_at", { ascending: true });
      setPendingMicRequests((requests ?? []) as unknown as MicRequestRow[]);
    } else setPendingMicRequests([]);
    setLoading(false);
  },[roomId]);

  useEffect(() => { void loadRoom(); },[loadRoom]);
  useEffect(() => {
    if (!supabase || !roomId) return;
    const channel = supabase.channel("room-seats-" + roomId)
      .on("postgres_changes",{event:"*",schema:"public",table:"room_seats",filter:"room_id=eq."+roomId},() => { void loadRoom(); })
      .on("postgres_changes",{event:"*",schema:"public",table:"room_requests",filter:"room_id=eq."+roomId},() => { void loadRoom(); })
      .on("postgres_changes",{event:"*",schema:"public",table:"room_members",filter:"room_id=eq."+roomId},() => { void loadRoom(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  },[roomId,loadRoom]);

  async function joinVoice() {
    if (!supabase || !room) return;
    setBusy(true); setError("");
    try {
      const { error: joinError } = await supabase.rpc("jehoo_join_room", { p_room_id: room.id });
      if (joinError) throw joinError;
      const { data, error: tokenError } = await supabase.functions.invoke("livekit-token",{body:{roomName:room.livekit_room_name}});
      if (tokenError) throw tokenError;
      if (!data?.serverUrl || !data?.participantToken) throw new Error("Voice token response is incomplete.");
      await AudioSession.startAudioSession();
      setLive({url:data.serverUrl,token:data.participantToken});
    } catch (e) {
      if (supabase && room) await supabase.rpc("jehoo_leave_room", { p_room_id: room.id });
      setError(e instanceof Error ? e.message : "Unable to connect to the voice room.");
      await AudioSession.stopAudioSession().catch(() => undefined);
    } finally { setBusy(false); }
  }
  async function leaveVoice() {
    setLive(null);
    await AudioSession.stopAudioSession().catch(() => undefined);
    if (supabase && room) {
      const { error: leaveError } = await supabase.rpc("jehoo_leave_room", { p_room_id: room.id });
      if (leaveError) setError(leaveError.message);
      else { setMicRequestSent(false); void loadRoom(); }
    }
  }
  async function handleMicrophoneRequest(requestId:string, accept:boolean) {
    if (!supabase) return;
    setHandlingRequest(requestId); setError("");
    try {
      const { data: decision, error: handleError } = await supabase.functions.invoke("room-microphone", { body: { requestId, accept } });
      if (handleError) throw handleError;
      if (decision?.error) throw new Error(String(decision.error));
      await loadRoom();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر معالجة طلب المايك");
    } finally { setHandlingRequest(null); }
  }
  async function requestMicrophone() {
    if (!supabase || !room) return;
    setMicRequestBusy(true); setError("");
    try {
      const { error: requestError } = await supabase.rpc("jehoo_request_microphone", { p_room_id: room.id });
      if (requestError) throw requestError;
      setMicRequestSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إرسال طلب المايك");
    } finally { setMicRequestBusy(false); }
  }

  const ar = true;
  const sortedSeats = useMemo(() => Array.from({length:20},(_,i) => seats.find((seat) => seat.seat_number === i+1) ?? ({
    room_id:roomId,seat_number:i+1,status:"empty" as const,user_id:null,reserved_for:null
  })),[seats,roomId]);

  return <View style={s.page}>
    <Stack.Screen options={{ title: room?.name ?? "JEHOO CHAT" }} />
    <View style={s.header}>
      <Pressable onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹ رجوع</Text></Pressable>
      <View style={{flex:1,alignItems:"flex-end"}}><Text style={s.title}>{room?.name ?? "الغرفة الصوتية"}</Text><Text style={s.subtitle}>{room?.description || "مساحة صوتية في JEHOO CHAT"}</Text></View>
    </View>
    {loading ? <ActivityIndicator color="#31D6B0" style={{marginTop:36}} /> : error && !room ? <View style={s.center}><Text style={s.error}>{error}</Text><Pressable onPress={() => void loadRoom()}><Text style={s.mint}>إعادة المحاولة</Text></Pressable></View> : <>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.stage}><Text style={s.stageEmoji}>🎙️</Text><Text style={s.stageTitle}>{live?"متصل بالغرفة":"اجتمعوا بالصوت"}</Text><Text style={s.subtitle}>{room?.status==="locked"?"الغرفة مقفلة":room?.status==="closed"?"الغرفة مغلقة":"الغرفة الصوتية المباشرة"}</Text>
          {live ? <LiveKitRoom serverUrl={live.url} token={live.token} connect={true} audio={true} video={false} onDisconnected={() => {
            setLive(null);
            void AudioSession.stopAudioSession().catch(() => undefined);
            if (supabase && room) void supabase.rpc("jehoo_leave_room", { p_room_id: room.id }).then(() => {
              setMicRequestSent(false);
              void loadRoom();
            });
          }}><View style={s.connected}><Text style={s.connectedText}>اتصال LiveKit نشط</Text>{!isHost ? <Pressable disabled={micRequestBusy || micRequestSent} onPress={() => void requestMicrophone()} style={[s.primary,{opacity:micRequestSent?0.65:1}]}>{micRequestBusy?<ActivityIndicator color="#06251E"/>:<Text style={s.primaryText}>{micRequestSent?"تم إرسال طلب المايك":"طلب المايك"}</Text>}</Pressable> : null}<Pressable onPress={() => void leaveVoice()} style={s.primary}><Text style={s.primaryText}>مغادرة الغرفة</Text></Pressable></View></LiveKitRoom> : <Pressable disabled={busy || room?.status==="closed"} onPress={() => void joinVoice()} style={s.primary}>{busy?<ActivityIndicator color="#06251E"/>:<Text style={s.primaryText}>الانضمام للصوت</Text>}</Pressable>}
        </View>
        {error ? <Text style={s.error}>{error}</Text> : null}
        {isHost && pendingMicRequests.length > 0 ? <View style={s.section}><Text style={s.sectionTitle}>طلبات المايك · {pendingMicRequests.length}</Text>{pendingMicRequests.map((request) => <View key={request.id} style={s.requestRow}><View style={{flex:1}}><Text style={s.requestName}>{request.profiles?.display_name || "مستخدم"}</Text><Text style={s.requestSub}>يريد التحدث</Text></View><Pressable disabled={handlingRequest===request.id} onPress={() => void handleMicrophoneRequest(request.id,false)} style={s.rejectButton}><Text style={s.rejectText}>رفض</Text></Pressable><Pressable disabled={handlingRequest===request.id} onPress={() => void handleMicrophoneRequest(request.id,true)} style={s.acceptButton}>{handlingRequest===request.id?<ActivityIndicator color="#06251E"/>:<Text style={s.acceptText}>قبول</Text>}</Pressable></View>)}</View> : null}
        <View style={s.section}><Text style={s.sectionTitle}>المقاعد الصوتية · 20</Text><View style={s.grid}>{sortedSeats.map((seat) => {
          const person = seat.user_id ? profiles[seat.user_id] : null;
          const reserved = seat.reserved_for ? profiles[seat.reserved_for] : null;
          const occupied = seat.status==="occupied" && Boolean(person);
          const label = seat.status==="locked"?"🔒":seat.status==="reserved"?"✦":person?.display_name?.slice(0,1) ?? (seat.seat_number===1 && isHost ? "👑" : "＋");
          return <View key={seat.seat_number} style={[s.seat,seat.status==="locked"&&s.seatLocked,occupied&&s.seatOccupied]}>
            <View style={s.avatar}><Text style={s.avatarText}>{label}</Text></View>
            <Text numberOfLines={1} style={s.seatName}>{person?.display_name ?? reserved?.display_name ?? (seat.status==="empty"?"فارغ":seat.status==="reserved"?"محجوز":"مقعد مقفل")}</Text>
            {person?.vip_level ? <Text style={s.vip}>VIP {person.vip_level}</Text> : null}
            {person ? <Text style={s.level}>LV {person.level}</Text> : null}
          </View>;
        })}</View></View>
      </ScrollView>
    </>}
  </View>;
}

const s=StyleSheet.create({
 page:{flex:1,backgroundColor:"#0A1118",paddingTop:46},
 header:{flexDirection:"row",alignItems:"center",gap:12,paddingHorizontal:18,paddingBottom:16,borderBottomWidth:1,borderBottomColor:"#263342"},
 back:{paddingVertical:10,paddingHorizontal:8},backText:{color:"#31D6B0",fontWeight:"700"},
 title:{color:"#F2F7FA",fontWeight:"800",fontSize:20},subtitle:{color:"#94A3B8",fontSize:12,marginTop:5},
 content:{padding:18,paddingBottom:40,gap:20},
 stage:{alignItems:"center",backgroundColor:"#121B25",borderRadius:20,borderWidth:1,borderColor:"#263342",padding:22,gap:12},
 stageEmoji:{fontSize:44},stageTitle:{color:"#F2F7FA",fontWeight:"800",fontSize:21},
 primary:{backgroundColor:"#31D6B0",borderRadius:12,minHeight:44,minWidth:170,paddingHorizontal:18,alignItems:"center",justifyContent:"center"},
 primaryText:{color:"#06251E",fontWeight:"800"},connected:{alignItems:"center",gap:12},connectedText:{color:"#31D6B0"},
 section:{gap:14},sectionTitle:{fontSize:18,fontWeight:"800",color:"#F2F7FA",textAlign:"right"},
 grid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",gap:10},
 seat:{width:"18%",minHeight:112,alignItems:"center",justifyContent:"center",backgroundColor:"#121B25",borderWidth:1,borderColor:"#263342",borderRadius:14,padding:5,gap:4},
 seatLocked:{borderColor:"#6B7280",backgroundColor:"#1C222B"},seatOccupied:{borderColor:"#31D6B0"},
 avatar:{width:40,height:40,borderRadius:20,alignItems:"center",justifyContent:"center",backgroundColor:"#1C3934"},avatarText:{fontSize:19,color:"#DFFCF3"},
 seatName:{fontSize:10,color:"#D7E2E9",maxWidth:"100%"},vip:{fontSize:9,color:"#F5CB74",fontWeight:"800"},level:{fontSize:9,color:"#94A3B8"},
 requestRow:{flexDirection:"row",alignItems:"center",gap:8,backgroundColor:"#121B25",padding:12,borderRadius:12,borderWidth:1,borderColor:"#263342"},requestName:{color:"#F2F7FA",fontWeight:"700",textAlign:"right"},requestSub:{color:"#94A3B8",fontSize:11,textAlign:"right",marginTop:3},rejectButton:{paddingVertical:9,paddingHorizontal:12,borderRadius:10,backgroundColor:"#40242A"},rejectText:{color:"#FDA4AF",fontWeight:"800"},acceptButton:{minWidth:60,alignItems:"center",justifyContent:"center",paddingVertical:9,paddingHorizontal:12,borderRadius:10,backgroundColor:"#31D6B0"},acceptText:{color:"#06251E",fontWeight:"800"},
 center:{alignItems:"center",padding:30,gap:12},error:{color:"#FDA4AF",textAlign:"center"},mint:{color:"#31D6B0"}
});
