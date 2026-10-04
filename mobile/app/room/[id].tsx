import { Alert, ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { AudioSession, LiveKitRoom, registerGlobals } from "@livekit/react-native";
import { supabase } from "@/lib/supabase";

type RoomRow = { id:string; name:string; description:string; status:"active"|"locked"|"closed"; owner_id:string; livekit_room_name:string };
type SeatRow = { room_id:string; seat_number:number; status:"empty"|"occupied"|"locked"|"reserved"; user_id:string|null; reserved_for:string|null };
type ProfileRow = { id:string; display_name:string; avatar_url:string; level:number; vip_level:number };
type MicRequestRow = { id:string; user_id:string; created_at:string; profiles?:{display_name:string}|null };

export default function VoiceRoomRoute() {
  const params = useLocalSearchParams<{id:string}>();
  const router = useRouter();
  const roomId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [room,setRoom]=useState<RoomRow|null>(null), [seats,setSeats]=useState<SeatRow[]>([]), [profiles,setProfiles]=useState<Record<string,ProfileRow>>({});
  const [loading,setLoading]=useState(true), [busy,setBusy]=useState(false), [live,setLive]=useState<{url:string;token:string}|null>(null), [error,setError]=useState("");
  const [isHost,setIsHost]=useState(false), [canModerate,setCanModerate]=useState(false);
  const [micRequestBusy,setMicRequestBusy]=useState(false), [micRequestSent,setMicRequestSent]=useState(false), [pendingMicRequests,setPendingMicRequests]=useState<MicRequestRow[]>([]);
  const [handlingRequest,setHandlingRequest]=useState<string|null>(null), [actingUser,setActingUser]=useState<string|null>(null); const [showAdmin,setShowAdmin]=useState(false), [members,setMembers]=useState<any[]>([]), [bans,setBans]=useState<any[]>([]), [showBans,setShowBans]=useState(false); const [roomTab,setRoomTab]=useState<"all"|"chat"|"gifts"|"enter">("all");
  const [conversationId,setConversationId]=useState<string|null>(null), [chatMessages,setChatMessages]=useState<any[]>([]), [chatDraft,setChatDraft]=useState(""), [chatBusy,setChatBusy]=useState(false);
  const [giftCatalog,setGiftCatalog]=useState<any[]>([]), [selectedRecipient,setSelectedRecipient]=useState<string|null>(null), [walletCoins,setWalletCoins]=useState<number|null>(null), [giftBusy,setGiftBusy]=useState(false);

  const loadRoom=useCallback(async()=>{
    const client=supabase;
    if(!client||!roomId){setError("Supabase or room ID is missing.");setLoading(false);return;}
    setError("");
    const {data:roomData,error:roomError}=await client.from("rooms").select("id,name,description,status,owner_id,livekit_room_name").eq("id",roomId).maybeSingle();
    if(roomError||!roomData){setError(roomError?.message??"Room not found.");setLoading(false);return;}
    setRoom(roomData as RoomRow);
    const {data:seatData,error:seatError}=await client.from("room_seats").select("room_id,seat_number,status,user_id,reserved_for").eq("room_id",roomId).order("seat_number");
    if(seatError){setError(seatError.message);setLoading(false);return;}
    const seatRows=(seatData??[]) as SeatRow[]; setSeats(seatRows);
    const ids=[...new Set(seatRows.flatMap(seat=>[seat.user_id,seat.reserved_for]).filter((id):id is string=>Boolean(id)))];
    if(ids.length){const {data:profileRows,error:profileError}=await client.from("profiles").select("id,display_name,avatar_url,level,vip_level").in("id",ids);if(profileError){setError(profileError.message);setLoading(false);return;}const map:Record<string,ProfileRow>={};(profileRows??[]).forEach(p=>{map[p.id]=p as ProfileRow});setProfiles(map);}else setProfiles({});
    const {data:{user}}=await client.auth.getUser(); const host=Boolean(user&&user.id===roomData.owner_id); setIsHost(host);
    let moderator=false;
    if(user&&!host){const {data:member}=await client.from("room_members").select("room_role").eq("room_id",roomId).eq("user_id",user.id).maybeSingle();moderator=["co_host","moderator"].includes(member?.room_role??"");}
    setCanModerate(host||moderator);
    if(host){const [{data:membersData},{data:bansData}]=await Promise.all([client.from("room_members").select("user_id,room_role,muted,profiles(display_name)").eq("room_id",roomId).order("room_role"),client.from("room_bans").select("user_id,reason,created_at,profiles(display_name)").eq("room_id",roomId).order("created_at",{ascending:false})]);setMembers(membersData??[]);setBans(bansData??[]);const {data:requests}=await client.from("room_requests").select("id,user_id,created_at,profiles(display_name)").eq("room_id",roomId).eq("request_type","microphone").eq("status","pending").order("created_at",{ascending:true});setPendingMicRequests((requests??[]) as unknown as MicRequestRow[]);}else {setPendingMicRequests([]);setMembers([]);setBans([]);}
    setLoading(false);
  },[roomId]);

  useEffect(()=>{void loadRoom()},[loadRoom]);
  useEffect(()=>{
    const client=supabase;
    if(!client||!roomId||roomTab!=="chat")return;
    let active=true; let channel:any=null;
    const start=async()=>{
      setChatBusy(true);setError("");
      try{
        const {data:convId,error:convError}=await client.rpc("jehoo_get_room_conversation",{p_room_id:roomId});
        if(convError)throw convError;
        if(!active)return;
        setConversationId(convId as string);
        const {data,error:messagesError}=await client.from("messages").select("id,conversation_id,sender_id,message_type,body,created_at").eq("conversation_id",convId as string).is("deleted_at",null).order("created_at",{ascending:true}).limit(100);
        if(messagesError)throw messagesError;
        const rows=(data??[]) as any[];
        if(rows.length){const ids=[...new Set(rows.map(m=>m.sender_id))];const {data:people}=await client.from("profiles").select("id,display_name,avatar_url").in("id",ids);const byId:Record<string,any>={};(people??[]).forEach(p=>byId[p.id]=p);rows.forEach(m=>m.profiles=byId[m.sender_id]);}
        if(active)setChatMessages(rows);
        channel=client.channel("room-chat-"+String(convId)).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"conversation_id=eq."+String(convId)},async(payload)=>{
          const row=payload.new as any;const {data:profile}=await client.from("profiles").select("id,display_name,avatar_url").eq("id",row.sender_id).maybeSingle();
          if(active)setChatMessages(prev=>prev.some(m=>m.id===row.id)?prev:[...prev,{...row,profiles:profile}]);
        }).subscribe();
      }catch(e){if(active)setError(e instanceof Error?e.message:"تعذر فتح دردشة الغرفة");}
      finally{if(active)setChatBusy(false);}
    };
    void start();return()=>{active=false;if(channel)void client.removeChannel(channel)};
  },[roomId,roomTab]);
  useEffect(()=>{
    const client=supabase;if(!client||!roomId||roomTab!=="gifts")return;let active=true;
    const loadGifts=async()=>{try{const [{data:gifts,error:giftsError},{data:{user}}]=await Promise.all([client.from("room_gift_catalog").select("gift_key,title,emoji,price").eq("is_active",true).order("price"),client.auth.getUser()]);if(giftsError)throw giftsError;if(active)setGiftCatalog(gifts??[]);if(user){const {data:wallet}=await client.from("wallets").select("coins").eq("user_id",user.id).maybeSingle();if(active)setWalletCoins(wallet?.coins??0);}}catch(e){if(active)setError(e instanceof Error?e.message:"تعذر تحميل الهدايا");}};
    void loadGifts();return()=>{active=false};
  },[roomId,roomTab]);
  async function sendRoomGift(giftKey:string){
    if(!supabase||!roomId||!selectedRecipient||giftBusy)return;setGiftBusy(true);setError("");
    try{const idempotencyKey="roomgift-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,12);
      const {data,error:giftError}=await supabase.rpc("jehoo_send_room_gift",{p_room_id:roomId,p_recipient_id:selectedRecipient,p_gift_key:giftKey,p_idempotency_key:idempotencyKey});
      if(giftError)throw giftError;
      const {data:{user}}=await supabase.auth.getUser();if(user){const {data:wallet}=await supabase.from("wallets").select("coins").eq("user_id",user.id).maybeSingle();setWalletCoins(wallet?.coins??0);}
      Alert.alert("تم إرسال الهدية","وصلت الهدية وتم تحديث رصيد المحفظة.");setRoomTab("chat");
    }catch(e){setError(e instanceof Error?e.message:"تعذر إرسال الهدية");}
    finally{setGiftBusy(false);}
  }
  async function sendRoomMessage(){
    const client=supabase;const body=chatDraft.trim();if(!client||!conversationId||!body||chatBusy)return;
    setChatBusy(true);
    try{const {data:{user}}=await client.auth.getUser();if(!user)throw new Error("سجّل الدخول لإرسال رسالة");
      const {data,error:sendError}=await client.from("messages").insert({conversation_id:conversationId,sender_id:user.id,message_type:"text",body}).select("id,conversation_id,sender_id,message_type,body,created_at").single();
      if(sendError)throw sendError;const {data:profile}=await client.from("profiles").select("id,display_name,avatar_url").eq("id",user.id).maybeSingle();
      setChatMessages(prev=>prev.some(m=>m.id===data.id)?prev:[...prev,{...data,profiles:profile}]);setChatDraft("");
    }catch(e){setError(e instanceof Error?e.message:"تعذر إرسال الرسالة");}finally{setChatBusy(false);}
  }

  useEffect(()=>{const client=supabase;if(!client||!roomId)return;const channel=client.channel("room-seats-"+roomId).on("postgres_changes",{event:"*",schema:"public",table:"room_seats",filter:"room_id=eq."+roomId},()=>void loadRoom()).on("postgres_changes",{event:"*",schema:"public",table:"room_requests",filter:"room_id=eq."+roomId},()=>void loadRoom()).on("postgres_changes",{event:"*",schema:"public",table:"room_members",filter:"room_id=eq."+roomId},()=>void loadRoom()).subscribe();return()=>{void client.removeChannel(channel)}},[roomId,loadRoom]);

  async function joinVoice(){
    const client=supabase;
    if(!client||!room)return;
    if(room.status==="closed"){setError("الغرفة مغلقة ولا يمكن الانضمام إليها.");return;}
    if(room.status==="locked"&&!isHost){setError("الغرفة مقفلة حالياً.");return;}
    setBusy(true);setError("");
    try{const {error:joinError}=await client.rpc("jehoo_join_room",{p_room_id:room.id});if(joinError)throw joinError;const {data,error:tokenError}=await client.functions.invoke("livekit-token",{body:{roomName:room.livekit_room_name}});if(tokenError)throw tokenError;if(!data?.serverUrl||!data?.participantToken)throw new Error("Voice token response is incomplete.");registerGlobals();await AudioSession.startAudioSession();setLive({url:data.serverUrl,token:data.participantToken})}catch(e){if(client&&room)await client.rpc("jehoo_leave_room",{p_room_id:room.id});setError(e instanceof Error?e.message:"Unable to connect to the voice room.");await AudioSession.stopAudioSession().catch(()=>undefined)}finally{setBusy(false)}}
  async function leaveVoice(){const client=supabase;setLive(null);await AudioSession.stopAudioSession().catch(()=>undefined);if(client&&room){const {error:leaveError}=await client.rpc("jehoo_leave_room",{p_room_id:room.id});if(leaveError)setError(leaveError.message);else{setMicRequestSent(false);void loadRoom()}}}
  async function handleMicrophoneRequest(requestId:string,accept:boolean){const client=supabase;if(!client)return;setHandlingRequest(requestId);setError("");try{const {data:decision,error:handleError}=await client.functions.invoke("room-microphone",{body:{requestId,accept}});if(handleError)throw handleError;if(decision?.error)throw new Error(String(decision.error));await loadRoom()}catch(e){setError(e instanceof Error?e.message:"تعذر معالجة طلب المايك")}finally{setHandlingRequest(null)}}
  async function requestMicrophone(){const client=supabase;if(!client||!room)return;setMicRequestBusy(true);setError("");try{const {error:requestError}=await client.rpc("jehoo_request_microphone",{p_room_id:room.id});if(requestError)throw requestError;setMicRequestSent(true)}catch(e){setError(e instanceof Error?e.message:"تعذر إرسال طلب المايك")}finally{setMicRequestBusy(false)}}

  async function roomAction(action:string,targetId:string){
    const client=supabase;
    if(!client||actingUser||!canModerate)return;
    setActingUser(targetId);setError("");
    try{
      let result:{error: any};
      if(action==="lower") result=await client.rpc("jehoo_lower_from_seat",{p_room_id:roomId,p_target_user_id:targetId});
      else if(action==="kick") result=await client.rpc("jehoo_kick_from_room",{p_room_id:roomId,p_target_user_id:targetId});
      else if(action==="mute") result=await client.rpc("jehoo_mute_room_member",{p_room_id:roomId,p_target_user_id:targetId,p_muted:true});
      else if(action==="ban") result=await client.rpc("jehoo_ban_from_room",{p_room_id:roomId,p_target_user_id:targetId,p_reason:"إدارة الغرفة"});
      else throw new Error("إجراء غير معروف");
      if(result.error)throw result.error;
      await loadRoom();
    }catch(e){setError(e instanceof Error?e.message:"تعذر تنفيذ الإجراء")}
    finally{setActingUser(null)}
  }
  async function setRole(targetId:string,role:string){const client=supabase;if(!client)return;setActingUser(targetId);setError("");try{const {error}=await client.rpc("jehoo_set_room_role",{p_room_id:roomId,p_target_user_id:targetId,p_role:role});if(error)throw error;await loadRoom()}catch(e){setError(e instanceof Error?e.message:"تعذر تغيير الصلاحية")}finally{setActingUser(null)}}

  async function changeRoomStatus(status:"active"|"locked"|"closed"){
    if(!isHost||!supabase)return;
    setError("");
    try{
      const {data:{user},error:userError}=await supabase.auth.getUser();
      if(userError)throw userError;
      if(!user)throw new Error("انتهت الجلسة، سجّل الدخول مجدداً.");
      const {error:statusError}=await supabase.from("rooms").update({status}).eq("id",roomId).eq("owner_id",user.id);
      if(statusError)throw statusError;
      await loadRoom();
      if(status==="closed")router.replace("/");
    }catch(e){setError(e instanceof Error?e.message:"تعذر تغيير حالة الغرفة")}
  }
  async function unban(id:string){
    if(!isHost||!supabase)return;
    setError("");
    try{
      const {error:unbanError}=await supabase.from("room_bans").delete().eq("room_id",roomId).eq("user_id",id);
      if(unbanError)throw unbanError;
      await loadRoom();
    }catch(e){setError(e instanceof Error?e.message:"تعذر إلغاء الحظر")}
  }
function openMemberActions(targetId:string,name:string){
    if(!canModerate)return;
    const buttons=[{text:"إنزال من المقعد",onPress:()=>void roomAction("lower",targetId)},{text:"كتم",onPress:()=>void roomAction("mute",targetId)},{text:"إخراج من الروم",onPress:()=>void roomAction("kick",targetId)},{text:"حظر من الروم",style:"destructive" as const,onPress:()=>void roomAction("ban",targetId)}];
    if(isHost)buttons.splice(2,0,{text:"تعيين مشرف",onPress:()=>void setRole(targetId,"moderator")},{text:"تعيين أدمن مساعد",onPress:()=>void setRole(targetId,"co_host")});
    Alert.alert("إدارة العضو",name,buttons as any);
  }

  const sortedSeats=useMemo(()=>Array.from({length:20},(_,i)=>seats.find(seat=>seat.seat_number===i+1)??({room_id:roomId,seat_number:i+1,status:"empty" as const,user_id:null,reserved_for:null})),[seats,roomId]);

  return <View style={s.page}>
    <Stack.Screen options={{title:room?.name??"JEHOO CHAT"}}/>
    <View style={s.header}><Pressable onPress={()=>router.back()} style={s.back}><Text style={s.backText}>‹ رجوع</Text></Pressable><View style={{flex:1,alignItems:"flex-end"}}><Text style={s.title}>{room?.name??"الغرفة الصوتية"}</Text><Text style={s.subtitle}>{room?.description||"مساحة صوتية في JEHOO CHAT"}</Text></View></View>
    {loading?<ActivityIndicator color="#31D6B0" style={{marginTop:36}}/>:error&&!room?<View style={s.center}><Text style={s.error}>{error}</Text><Pressable onPress={()=>void loadRoom()}><Text style={s.mint}>إعادة المحاولة</Text></Pressable></View>:<>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.stage}><Text style={s.stageEmoji}>🎙️</Text><Text style={s.stageTitle}>{live?"متصل بالغرفة":"اجتمعوا بالصوت"}</Text><Text style={s.subtitle}>{room?.status==="locked"?"الغرفة مقفلة":room?.status==="closed"?"الغرفة مغلقة":"الغرفة الصوتية المباشرة"}</Text>
          {live?<LiveKitRoom serverUrl={live.url} token={live.token} connect audio video={false} onDisconnected={()=>{setLive(null);void AudioSession.stopAudioSession().catch(()=>undefined);const client=supabase;if(client&&room)void client.rpc("jehoo_leave_room",{p_room_id:room.id}).then(()=>{setMicRequestSent(false);void loadRoom()})}}><View style={s.connected}><Text style={s.connectedText}>اتصال LiveKit نشط</Text>{!isHost?<Pressable disabled={micRequestBusy||micRequestSent} onPress={()=>void requestMicrophone()} style={[s.primary,{opacity:micRequestSent?0.65:1}]}>{micRequestBusy?<ActivityIndicator color="#06251E"/>:<Text style={s.primaryText}>{micRequestSent?"تم إرسال طلب المايك":"طلب المايك"}</Text>}</Pressable>:null}<Pressable onPress={()=>void leaveVoice()} style={s.primary}><Text style={s.primaryText}>مغادرة الغرفة</Text></Pressable></View></LiveKitRoom>:<Pressable disabled={busy||room?.status==="closed"} onPress={()=>void joinVoice()} style={s.primary}>{busy?<ActivityIndicator color="#06251E"/>:<Text style={s.primaryText}>الانضمام للصوت</Text>}</Pressable>}
        </View>
        {error?<Text style={s.error}>{error}</Text>:null}
        {canModerate?<View style={s.adminBadge}><Text style={s.adminBadgeText}>{isHost?"👑 مالك الغرفة":"🛡️ إدارة الغرفة"} · صلاحيات فعالة</Text></View>:null}
        {isHost?<View style={s.adminPanel}><Pressable style={s.adminHead} onPress={()=>setShowAdmin(v=>!v)}><View><Text style={s.adminTitle}>⚙️ إدارة الغرفة</Text><Text style={s.adminSub}>الأعضاء · الصلاحيات · الحظر · حالة الروم</Text></View><Text style={s.chevron}>{showAdmin?"⌃":"⌄"}</Text></Pressable>{showAdmin?<View style={s.adminBody}><Text style={s.label}>حالة الروم</Text><View style={s.row}><Pressable onPress={()=>void changeRoomStatus("active")} style={s.small}><Text style={s.smallText}>فتح</Text></Pressable><Pressable onPress={()=>void changeRoomStatus("locked")} style={s.small}><Text style={s.smallText}>قفل</Text></Pressable><Pressable onPress={()=>void changeRoomStatus("closed")} style={s.danger}><Text style={s.dangerText}>إغلاق</Text></Pressable></View><Text style={s.label}>الأعضاء والصلاحيات · {members.length}</Text>{members.map(m=><View key={m.user_id} style={s.member}><View style={{flex:1}}><Text style={s.memberName}>{m.profiles?.display_name||"مستخدم"}</Text><Text style={s.memberRole}>{m.room_role==="co_host"?"أدمن مساعد":m.room_role==="moderator"?"مشرف":m.room_role}</Text></View>{m.room_role==="co_host"||m.room_role==="moderator"?<Pressable onPress={()=>void setRole(m.user_id,"listener")} style={s.small}><Text style={s.smallText}>إزالة</Text></Pressable>:null}<Pressable onPress={()=>openMemberActions(m.user_id,m.profiles?.display_name||"مستخدم")} style={s.manage}><Text style={s.manageText}>إدارة</Text></Pressable></View>)}<Pressable onPress={()=>setShowBans(v=>!v)} style={s.bans}><Text style={s.label}>🚫 المحظورون · {bans.length}</Text><Text style={s.chevron}>{showBans?"⌃":"⌄"}</Text></Pressable>{showBans&&(bans.length?bans.map(b=><View key={b.user_id} style={s.member}><View style={{flex:1}}><Text style={s.memberName}>{b.profiles?.display_name||"مستخدم"}</Text><Text style={s.memberRole}>{b.reason||"محظور"}</Text></View><Pressable onPress={()=>void unban(b.user_id)} style={s.small}><Text style={s.smallText}>إلغاء الحظر</Text></Pressable></View>):<Text style={s.empty}>لا يوجد أعضاء محظورون.</Text>)}</View>:null}</View>:null}{isHost&&pendingMicRequests.length>0?<View style={s.section}><Text style={s.sectionTitle}>طلبات المايك · {pendingMicRequests.length}</Text>{pendingMicRequests.map(request=><View key={request.id} style={s.requestRow}><View style={{flex:1}}><Text style={s.requestName}>{request.profiles?.display_name||"مستخدم"}</Text><Text style={s.requestSub}>يريد التحدث</Text></View><Pressable disabled={handlingRequest===request.id} onPress={()=>void handleMicrophoneRequest(request.id,false)} style={s.rejectButton}><Text style={s.rejectText}>رفض</Text></Pressable><Pressable disabled={handlingRequest===request.id} onPress={()=>void handleMicrophoneRequest(request.id,true)} style={s.acceptButton}>{handlingRequest===request.id?<ActivityIndicator color="#06251E"/>:<Text style={s.acceptText}>قبول</Text>}</Pressable></View>)}</View>:null}
        <View style={s.section}><Text style={s.sectionTitle}>المقاعد الصوتية · 20</Text><Text style={s.helper}>اضغط على عضو لإدارة المقعد والصلاحيات</Text><View style={s.grid}>{sortedSeats.map(seat=>{const person=seat.user_id?profiles[seat.user_id]:null;const reserved=seat.reserved_for?profiles[seat.reserved_for]:null;const occupied=seat.status==="occupied"&&Boolean(person);const label=seat.status==="locked"?"🔒":seat.status==="reserved"?"✦":person?.display_name?.slice(0,1)??(seat.seat_number===1&&isHost?"👑":"＋");return <Pressable key={seat.seat_number} disabled={!person||!canModerate} onPress={()=>person&&openMemberActions(person.id,person.display_name)} style={[s.seat,seat.status==="locked"&&s.seatLocked,occupied&&s.seatOccupied]}><View style={s.avatar}><Text style={s.avatarText}>{label}</Text></View><Text numberOfLines={1} style={s.seatName}>{person?.display_name??reserved?.display_name??(seat.status==="empty"?"فارغ":seat.status==="reserved"?"محجوز":"مقعد مقفل")}</Text>{person?.vip_level?<Text style={s.vip}>VIP {person.vip_level}</Text>:null}{person?<Text style={s.level}>LV {person.level}</Text>:null}</Pressable>})}</View><View style={s.roomTabs}>{([{id:"all",label:"الكل"},{id:"chat",label:"دردشة"},{id:"gifts",label:"هدية"},{id:"enter",label:"أدخل"}] as const).map(tab=><Pressable key={tab.id} onPress={()=>setRoomTab(tab.id)} style={[s.roomTab,roomTab===tab.id&&s.roomTabActive]}><Text style={[s.roomTabText,roomTab===tab.id&&s.roomTabTextActive]}>{tab.label}</Text></Pressable>)}</View>{roomTab!=="all"?roomTab==="chat"?<View style={s.tabNotice}><Text style={s.tabNoticeTitle}>دردشة الغرفة</Text>{chatBusy&&!chatMessages.length?<ActivityIndicator color="#31D6B0"/>:null}<ScrollView style={s.chatList} nestedScrollEnabled contentContainerStyle={{gap:9}}>{chatMessages.map((m:any)=><View key={m.id} style={s.chatBubble}><Text style={s.chatSender}>{m.profiles?.display_name||"مستخدم"}</Text><Text style={s.chatBody}>{m.body}</Text><Text style={s.chatTime}>{new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</Text></View>)}</ScrollView><View style={s.chatComposer}><TextInput value={chatDraft} onChangeText={setChatDraft} placeholder="اكتب رسالة..." placeholderTextColor="#82A99D" maxLength={1000} style={s.chatInput} multiline/><Pressable disabled={!chatDraft.trim()||chatBusy||!conversationId} onPress={()=>void sendRoomMessage()} style={[s.chatSend,(!chatDraft.trim()||chatBusy||!conversationId)&&{opacity:0.5}]}><Text style={s.chatSendText}>إرسال</Text></Pressable></View><Text style={s.tabNoticeText}>الدردشة متاحة لأعضاء الغرفة بعد الانضمام.</Text></View>:<View style={s.tabNotice}><Text style={s.tabNoticeTitle}>{roomTab==="gifts"?"الهدايا":"طلبات الدخول"}</Text><Text style={s.tabNoticeText}>{roomTab==="gifts"?"اختر عضوًا من الغرفة ثم اختر هدية لإرسالها من رصيدك.":"يمكنك الانضمام للصوت ثم طلب المايك من المضيف."}</Text>{roomTab==="gifts"?<><Text style={s.giftBalance}>رصيدك: {walletCoins===null?"—":walletCoins.toLocaleString()} عملة</Text><Text style={s.giftLabel}>اختر المستلم</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.giftChoices}>{[...new Map(seats.filter(x=>x.user_id).map(x=>[x.user_id!,{id:x.user_id!,name:profiles[x.user_id!]?.display_name||"عضو"}])).values()].map(person=><Pressable key={person.id} onPress={()=>setSelectedRecipient(person.id)} style={[s.giftRecipient,selectedRecipient===person.id&&s.giftRecipientActive]}><Text style={s.giftRecipientText}>{person.name}</Text></Pressable>)}</ScrollView><Text style={s.giftLabel}>الهدايا المتاحة</Text><View style={s.giftChoices}>{giftCatalog.map(g=><Pressable key={g.gift_key} disabled={giftBusy||!selectedRecipient} onPress={()=>void sendRoomGift(g.gift_key)} style={[s.giftCard,(!selectedRecipient||giftBusy)&&{opacity:0.55}]}><Text style={s.giftEmoji}>{g.emoji}</Text><Text style={s.giftTitle}>{g.title}</Text><Text style={s.giftPrice}>{g.price} عملة</Text></Pressable>)}</View>{giftBusy?<ActivityIndicator color="#31D6B0"/>:null}</>:null}{roomTab==="enter"?<Pressable onPress={()=>live?void requestMicrophone():void joinVoice()} style={s.primary}><Text style={s.primaryText}>{live?"طلب المايك":"الانضمام للصوت"}</Text></Pressable>:null}</View>:null}</ScrollView><View style={s.roomDock}><Pressable onPress={()=>setRoomTab("all")} style={s.dockButton}><Text style={s.dockIcon}>✥</Text><Text style={s.dockLabel}>المقاعد</Text></Pressable><Pressable onPress={()=>setRoomTab("chat")} style={s.dockButton}><Text style={s.dockIcon}>✉</Text><Text style={s.dockLabel}>الدردشة</Text></Pressable><Pressable onPress={()=>setRoomTab("gifts")} style={s.giftDock}><Text style={{fontSize:24}}>🎁</Text></Pressable><Pressable onPress={()=>live?void leaveVoice():void joinVoice()} style={s.dockButton}><Text style={s.dockIcon}>{live?"⏻":"🎙"}</Text><Text style={s.dockLabel}>{live?"مغادرة":"دخول"}</Text></Pressable></View>
    </>}
  </View>;
}
const s=StyleSheet.create({
 page:{flex:1,backgroundColor:"#042D26",paddingTop:46},header:{flexDirection:"row-reverse",alignItems:"center",gap:12,paddingHorizontal:18,paddingBottom:16,borderBottomWidth:1,borderBottomColor:"#155447"},back:{paddingVertical:10,paddingHorizontal:8},backText:{color:"#71E8C9",fontWeight:"800"},title:{color:"#F2FFF9",fontWeight:"900",fontSize:20},subtitle:{color:"#9BC5B8",fontSize:12,marginTop:5},content:{padding:16,paddingBottom:130,gap:20},stage:{alignItems:"center",backgroundColor:"#073B30",borderRadius:24,borderWidth:1,borderColor:"#1B715B",padding:22,gap:12},stageEmoji:{fontSize:44},stageTitle:{color:"#F2FFF9",fontWeight:"900",fontSize:21},primary:{backgroundColor:"#31D6B0",borderRadius:12,minHeight:44,minWidth:170,paddingHorizontal:18,alignItems:"center",justifyContent:"center"},primaryText:{color:"#06251E",fontWeight:"800"},connected:{alignItems:"center",gap:12},connectedText:{color:"#31D6B0"},section:{gap:14},sectionTitle:{fontSize:18,fontWeight:"900",color:"#E7FFF5",textAlign:"right"},helper:{color:"#85B5A7",fontSize:11,textAlign:"right"},grid:{flexDirection:"row-reverse",flexWrap:"wrap",justifyContent:"space-between",gap:10},seat:{width:"18.5%",minHeight:112,alignItems:"center",justifyContent:"center",backgroundColor:"#0B493B",borderWidth:1,borderColor:"#236B59",borderRadius:42,padding:5,gap:4,marginBottom:2},seatLocked:{borderColor:"#64756F",backgroundColor:"#17342D"},seatOccupied:{borderColor:"#48E3BD",backgroundColor:"#0D5A47"},avatar:{width:44,height:44,borderRadius:22,alignItems:"center",justifyContent:"center",backgroundColor:"#155849",borderWidth:1,borderColor:"#4A9C83"},avatarText:{fontSize:19,color:"#DFFCF3",fontWeight:"900"},seatName:{fontSize:10,color:"#D7F6EB",maxWidth:"100%",fontWeight:"700"},vip:{fontSize:9,color:"#F5CB74",fontWeight:"800"},level:{fontSize:9,color:"#94A3B8"},requestRow:{flexDirection:"row",alignItems:"center",gap:8,backgroundColor:"#121B25",padding:12,borderRadius:12,borderWidth:1,borderColor:"#263342"},requestName:{color:"#F2F7FA",fontWeight:"700",textAlign:"right"},requestSub:{color:"#94A3B8",fontSize:11,textAlign:"right",marginTop:3},rejectButton:{paddingVertical:9,paddingHorizontal:12,borderRadius:10,backgroundColor:"#40242A"},rejectText:{color:"#FDA4AF",fontWeight:"800"},acceptButton:{minWidth:60,alignItems:"center",justifyContent:"center",paddingVertical:9,paddingHorizontal:12,borderRadius:10,backgroundColor:"#31D6B0"},acceptText:{color:"#06251E",fontWeight:"800"},adminBadge:{backgroundColor:"#142A2A",borderRadius:12,padding:12,borderWidth:1,borderColor:"#2D6B60"},adminBadgeText:{color:"#7DE7D0",fontWeight:"800",textAlign:"right"},adminPanel:{backgroundColor:"#101923",borderRadius:18,borderWidth:1,borderColor:"#2A3A49",overflow:"hidden"},adminHead:{padding:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},adminTitle:{color:"#F2F7FA",fontWeight:"900",fontSize:17},adminSub:{color:"#718096",fontSize:11,marginTop:4},adminBody:{padding:14,gap:10,borderTopWidth:1,borderTopColor:"#263342"},chevron:{color:"#31D6B0",fontSize:22},label:{color:"#CBD5E1",fontWeight:"800",textAlign:"right"},row:{flexDirection:"row",justifyContent:"flex-end",gap:8},small:{backgroundColor:"#31D6B0",borderRadius:9,paddingHorizontal:11,paddingVertical:8},smallText:{color:"#06251E",fontWeight:"800",fontSize:11},danger:{backgroundColor:"#40242A",borderRadius:9,paddingHorizontal:11,paddingVertical:8},dangerText:{color:"#FDA4AF",fontWeight:"800",fontSize:11},member:{flexDirection:"row",alignItems:"center",gap:8,backgroundColor:"#121B25",padding:10,borderRadius:12,borderWidth:1,borderColor:"#263342"},memberName:{color:"#F2F7FA",fontWeight:"700",textAlign:"right"},memberRole:{color:"#94A3B8",fontSize:10,textAlign:"right",marginTop:3},manage:{borderWidth:1,borderColor:"#31D6B0",borderRadius:9,paddingHorizontal:10,paddingVertical:7},manageText:{color:"#31D6B0",fontWeight:"800",fontSize:11},bans:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},empty:{color:"#64748B",fontSize:12,textAlign:"right"},center:{alignItems:"center",padding:30,gap:12},error:{color:"#FDA4AF",textAlign:"center"},mint:{color:"#31D6B0"},roomTabs:{flexDirection:"row-reverse",justifyContent:"flex-start",gap:22,paddingVertical:8,borderBottomWidth:1,borderBottomColor:"#155447"},roomTab:{paddingVertical:8,borderBottomWidth:3,borderBottomColor:"transparent"},roomTabActive:{borderBottomColor:"#31D6B0"},roomTabText:{fontSize:14,color:"#86A99F",fontWeight:"700"},roomTabTextActive:{color:"#55E6C3"},tabNotice:{backgroundColor:"#073B30",borderColor:"#1B715B",borderWidth:1,borderRadius:18,padding:16,gap:10},tabNoticeTitle:{color:"#E7FFF5",fontSize:17,fontWeight:"900",textAlign:"right"},tabNoticeText:{color:"#9BC5B8",fontSize:13,textAlign:"right",lineHeight:21},chatList:{maxHeight:300,minHeight:100},chatBubble:{alignSelf:"stretch",backgroundColor:"#0B493B",borderRadius:12,padding:10,borderWidth:1,borderColor:"#236B59",gap:4},chatSender:{color:"#65E3C3",fontSize:12,fontWeight:"900",textAlign:"right"},chatBody:{color:"#E7FFF5",fontSize:14,textAlign:"right",lineHeight:20},chatTime:{color:"#85B5A7",fontSize:10,textAlign:"left"},chatComposer:{flexDirection:"row-reverse",alignItems:"center",gap:8},chatInput:{flex:1,minHeight:42,maxHeight:100,borderRadius:12,backgroundColor:"#042D26",borderWidth:1,borderColor:"#236B59",color:"#F2FFF9",paddingHorizontal:12,paddingVertical:8,textAlign:"right"},chatSend:{backgroundColor:"#31D6B0",borderRadius:11,paddingHorizontal:14,paddingVertical:12},chatSendText:{color:"#06251E",fontWeight:"900"},giftBalance:{color:"#65E3C3",fontWeight:"900",textAlign:"right"},giftLabel:{color:"#E7FFF5",fontWeight:"900",textAlign:"right",marginTop:4},giftChoices:{flexDirection:"row",flexWrap:"wrap",gap:8,justifyContent:"flex-end"},giftRecipient:{backgroundColor:"#042D26",borderWidth:1,borderColor:"#236B59",borderRadius:12,padding:10},giftRecipientActive:{borderColor:"#31D6B0",backgroundColor:"#0D5A47"},giftRecipientText:{color:"#E7FFF5",fontWeight:"700"},giftCard:{minWidth:90,alignItems:"center",backgroundColor:"#042D26",borderWidth:1,borderColor:"#236B59",borderRadius:14,padding:12,gap:5},giftEmoji:{fontSize:28},giftTitle:{color:"#E7FFF5",fontWeight:"800"},giftPrice:{color:"#65E3C3",fontSize:11,fontWeight:"800"},roomDock:{position:"absolute",bottom:12,left:14,right:14,backgroundColor:"#06382E",borderWidth:1,borderColor:"#1B715B",borderRadius:26,paddingVertical:10,paddingHorizontal:12,flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-around",elevation:8},dockButton:{alignItems:"center",justifyContent:"center",minWidth:55,gap:3},dockIcon:{color:"#B8F8E5",fontSize:23,fontWeight:"800"},dockLabel:{color:"#9BC5B8",fontSize:10,fontWeight:"700"},giftDock:{width:56,height:56,borderRadius:28,backgroundColor:"#6E49E8",borderWidth:2,borderColor:"#8EEFD7",alignItems:"center",justifyContent:"center",marginTop:-22}
});