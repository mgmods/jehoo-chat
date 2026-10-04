import { Alert, ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { AudioSession, LiveKitRoom } from "@livekit/react-native";
import { Room, RoomEvent } from "livekit-client";
import { supabase } from "@/lib/supabase";

type RoomRow = { id:string; name:string; description:string; status:"active"|"locked"|"closed"; owner_id:string; livekit_room_name:string; cover_url:string|null; max_seats:number; password_enabled:boolean; welcome_message:string };
type SeatRow = { room_id:string; seat_number:number; status:"empty"|"occupied"|"locked"|"reserved"; user_id:string|null; reserved_for:string|null };
type ProfileRow = { id:string; display_name:string; avatar_url:string; level:number; vip_level:number };
type MicRequestRow = { id:string; user_id:string; created_at:string; profiles?:{display_name:string}|null };

export default function VoiceRoomRoute() {
  const params = useLocalSearchParams<{id:string}>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const roomId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [room,setRoom]=useState<RoomRow|null>(null), [seats,setSeats]=useState<SeatRow[]>([]), [profiles,setProfiles]=useState<Record<string,ProfileRow>>({});
  const [ownerProfile,setOwnerProfile]=useState<ProfileRow|null>(null), [followed,setFollowed]=useState(false), [currentUserId,setCurrentUserId]=useState<string|null>(null);
  const [loading,setLoading]=useState(true), [busy,setBusy]=useState(false), [live,setLive]=useState<{url:string;token:string}|null>(null), [error,setError]=useState("");
  const [liveRoom,setLiveRoom]=useState<Room|null>(null); const liveRoomRef=useRef<Room|null>(null); const joinAttemptRef=useRef(0);
  const [passwordModal,setPasswordModal]=useState(false), [joinPassword,setJoinPassword]=useState("");
  const [settingsName,setSettingsName]=useState(""), [settingsDescription,setSettingsDescription]=useState(""), [settingsCover,setSettingsCover]=useState(""), [settingsSeats,setSettingsSeats]=useState("10"), [settingsPasswordEnabled,setSettingsPasswordEnabled]=useState(false), [settingsPassword,setSettingsPassword]=useState(""), [settingsWelcome,setSettingsWelcome]=useState(""), [settingsBusy,setSettingsBusy]=useState(false);
  const [isHost,setIsHost]=useState(false), [canModerate,setCanModerate]=useState(false), [micEnabled,setMicEnabled]=useState(true), [isRoomMember,setIsRoomMember]=useState(false);
  const [micRequestBusy,setMicRequestBusy]=useState(false), [micRequestSent,setMicRequestSent]=useState(false), [pendingMicRequests,setPendingMicRequests]=useState<MicRequestRow[]>([]);
  const [handlingRequest,setHandlingRequest]=useState<string|null>(null), [actingUser,setActingUser]=useState<string|null>(null); const [showAdmin,setShowAdmin]=useState(false), [members,setMembers]=useState<any[]>([]), [bans,setBans]=useState<any[]>([]), [showBans,setShowBans]=useState(false); const [roomTab,setRoomTab]=useState<"all"|"chat"|"gifts"|"enter">("all");
  const [conversationId,setConversationId]=useState<string|null>(null), [chatMessages,setChatMessages]=useState<any[]>([]), [chatDraft,setChatDraft]=useState(""), [chatBusy,setChatBusy]=useState(false);
  const [giftCatalog,setGiftCatalog]=useState<any[]>([]), [giftRecipients,setGiftRecipients]=useState<{id:string;name:string}[]>([]), [selectedRecipient,setSelectedRecipient]=useState<string|null>(null), [walletCoins,setWalletCoins]=useState<number|null>(null), [giftBusy,setGiftBusy]=useState(false);
  const isRoomParticipant=Boolean(currentUserId&&(room?.owner_id===currentUserId||isRoomMember||seats.some(seat=>seat.user_id===currentUserId&&seat.status==="occupied")));

  const loadRoom=useCallback(async()=>{
    const client=supabase;
    if(!client||!roomId){setError("Supabase or room ID is missing.");setLoading(false);return;}
    setError("");
    const {data:roomData,error:roomError}=await client.from("rooms").select("id,name,description,status,owner_id,livekit_room_name,cover_url,max_seats,password_enabled,welcome_message").eq("id",roomId).maybeSingle();
    if(roomError||!roomData){setError(roomError?.message??"Room not found.");setLoading(false);return;}
    setRoom(roomData as RoomRow); const {data:owner}=await client.from("profiles").select("id,display_name,avatar_url,level,vip_level").eq("id",roomData.owner_id).maybeSingle(); setOwnerProfile(owner as ProfileRow|null); const {data:{user:viewer}}=await client.auth.getUser(); setCurrentUserId(viewer?.id??null); if(viewer&&viewer.id!==roomData.owner_id){const {data:follow}=await client.from("user_follows").select("id").eq("follower_id",viewer.id).eq("following_id",roomData.owner_id).maybeSingle();setFollowed(Boolean(follow));} setSettingsName(roomData.name); setSettingsDescription(roomData.description||""); setSettingsCover(roomData.cover_url||""); setSettingsSeats(String(roomData.max_seats||10)); setSettingsPasswordEnabled(Boolean(roomData.password_enabled)); setSettingsWelcome(roomData.welcome_message||"");
    const {data:roomPeople}=await client.from("room_members").select("user_id").eq("room_id",roomId);
    const recipientIds=[...new Set([...(roomPeople??[]).map(person=>person.user_id),roomData.owner_id].filter(id=>id&&id!==viewer?.id))];
    if(recipientIds.length){const {data:recipientProfiles}=await client.from("profiles").select("id,display_name").in("id",recipientIds);const recipientMap:Record<string,string>={};(recipientProfiles??[]).forEach(person=>recipientMap[person.id]=person.display_name||"عضو");setGiftRecipients(recipientIds.map(id=>({id,name:recipientMap[id]||"عضو"})));}else setGiftRecipients([]);
    const {data:seatData,error:seatError}=await client.from("room_seats").select("room_id,seat_number,status,user_id,reserved_for").eq("room_id",roomId).order("seat_number");
    if(seatError){setError(seatError.message);setLoading(false);return;}
    const seatRows=(seatData??[]) as SeatRow[]; setSeats(seatRows);
    const ids=[...new Set(seatRows.flatMap(seat=>[seat.user_id,seat.reserved_for]).filter((id):id is string=>Boolean(id)))];
    if(ids.length){const {data:profileRows,error:profileError}=await client.from("profiles").select("id,display_name,avatar_url,level,vip_level").in("id",ids);if(profileError){setError(profileError.message);setLoading(false);return;}const map:Record<string,ProfileRow>={};(profileRows??[]).forEach(p=>{map[p.id]=p as ProfileRow});setProfiles(map);}else setProfiles({});
    const {data:{user}}=await client.auth.getUser(); const host=Boolean(user&&user.id===roomData.owner_id); setIsHost(host);
    let moderator=false;let memberRole="listener";let memberMuted=false;
    if(user&&!host){const {data:member}=await client.from("room_members").select("room_role,muted").eq("room_id",roomId).eq("user_id",user.id).maybeSingle();memberRole=member?.room_role??"listener";memberMuted=Boolean(member?.muted);setIsRoomMember(Boolean(member));moderator=["co_host","moderator"].includes(memberRole);}else setIsRoomMember(host);
    setCanModerate(host||moderator);
    if(host||moderator){const [{data:membersData},{data:bansData}]=await Promise.all([client.from("room_members").select("user_id,room_role,muted,profiles(display_name)").eq("room_id",roomId).order("room_role"),client.from("room_bans").select("user_id,reason,created_at,profiles(display_name)").eq("room_id",roomId).order("created_at",{ascending:false})]);setMembers(membersData??[]);setBans(bansData??[]);const {data:requests}=await client.from("room_requests").select("id,user_id,created_at,profiles(display_name)").eq("room_id",roomId).eq("request_type","microphone").eq("status","pending").order("created_at",{ascending:true});setPendingMicRequests((requests??[]) as unknown as MicRequestRow[]);}else {setPendingMicRequests([]);setMembers([]);setBans([]);}
    if(user&&liveRoom){
      const {data:latestRequest}=await client.from("room_requests").select("status").eq("room_id",roomId).eq("user_id",user.id).eq("request_type","microphone").order("created_at",{ascending:false}).limit(1).maybeSingle();
      if(memberMuted||(!host&&!["co_host","moderator","speaker"].includes(memberRole))){try{await liveRoom.localParticipant.setMicrophoneEnabled(false);setMicEnabled(false)}catch{}}else if(latestRequest?.status==="accepted"){try{await liveRoom.localParticipant.setMicrophoneEnabled(true);setMicEnabled(true);setMicRequestSent(false)}catch(e){setError(e instanceof Error?e.message:"تمت الموافقة على المايك لكن تعذر تفعيله. جارٍ إعادة المحاولة.");setTimeout(async()=>{if(liveRoomRef.current!==liveRoom)return;try{await liveRoom.localParticipant.setMicrophoneEnabled(true);setMicEnabled(true);setMicRequestSent(false);setError("")}catch{}},1200)}}
    }
    setLoading(false);
  },[roomId,liveRoom]);

  useEffect(()=>{void loadRoom()},[loadRoom]);
  useEffect(()=>{
    const client=supabase;
    if(!client||!roomId||!isRoomParticipant)return;
    let active=true; let channel:any=null;
    setChatMessages([]);
    setConversationId(null);
    const start=async()=>{
      setChatBusy(true);setError("");
      try{
        const {data:convId,error:convError}=await client.rpc("jehoo_get_room_conversation",{p_room_id:roomId});
        if(convError)throw convError;
        if(!active)return;
        setConversationId(convId as string);
        // Subscribe first, then load only this visit's messages to cover reconnects and the subscribe race.
        channel=client.channel("room-chat-"+String(convId)).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"conversation_id=eq."+String(convId)},async(payload)=>{
          const row=payload.new as any;
          const {data:profile}=await client.from("profiles").select("id,display_name,avatar_url").eq("id",row.sender_id).maybeSingle();
          if(active)setChatMessages(prev=>prev.some(m=>m.id===row.id)?prev:[...prev,{...row,profiles:profile}]);
        }).subscribe(async(status)=>{
          if(status!=="SUBSCRIBED"||!active)return;
          try{
            const {data:{user}}=await client.auth.getUser();
            if(!user)return;
            const {data:member,error:memberError}=await client.from("conversation_members").select("joined_at").eq("conversation_id",String(convId)).eq("user_id",user.id).maybeSingle();
            if(memberError)throw memberError;
            if(!member?.joined_at)return;
            const {data:rows,error:messagesError}=await client.from("messages").select("id,conversation_id,sender_id,message_type,body,created_at").eq("conversation_id",String(convId)).is("deleted_at",null).gt("created_at",member.joined_at).order("created_at",{ascending:true}).limit(100);
            if(messagesError)throw messagesError;
            const items=(rows??[]) as any[];
            if(items.length){
              const ids=[...new Set(items.map(m=>m.sender_id))];
              const {data:people}=await client.from("profiles").select("id,display_name,avatar_url").in("id",ids);
              const byId:Record<string,any>={};(people??[]).forEach(p=>byId[p.id]=p);
              items.forEach(m=>m.profiles=byId[m.sender_id]);
            }
            if(active)setChatMessages(prev=>{const byId=new Map(prev.map(m=>[m.id,m]));items.forEach(m=>byId.set(m.id,m));return [...byId.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at));});
          }catch(e){if(active)setError(e instanceof Error?e.message:"تعذر مزامنة رسائل الغرفة");}
        });
      }catch(e){if(active)setError(e instanceof Error?e.message:"تعذر فتح دردشة الغرفة");}
      finally{if(active)setChatBusy(false);}
    };
    void start();return()=>{active=false;setChatMessages([]);setConversationId(null);if(channel)void client.removeChannel(channel)};
  },[roomId,isRoomParticipant]);
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

  useEffect(()=>{const client=supabase;if(!client||!roomId)return;const channel=client.channel("room-live-"+roomId).on("postgres_changes",{event:"*",schema:"public",table:"rooms",filter:"id=eq."+roomId},()=>void loadRoom()).on("postgres_changes",{event:"*",schema:"public",table:"room_seats",filter:"room_id=eq."+roomId},()=>void loadRoom()).on("postgres_changes",{event:"*",schema:"public",table:"room_requests",filter:"room_id=eq."+roomId},()=>void loadRoom()).on("postgres_changes",{event:"*",schema:"public",table:"room_members",filter:"room_id=eq."+roomId},()=>void loadRoom()).subscribe();return()=>{void client.removeChannel(channel)}},[roomId,loadRoom]);

  useEffect(()=>()=>{joinAttemptRef.current+=1;const roomInstance=liveRoomRef.current;liveRoomRef.current=null;if(roomInstance){void roomInstance.disconnect();}void AudioSession.stopAudioSession().catch(()=>undefined);const client=supabase;if(client&&roomId)void client.rpc("jehoo_leave_room",{p_room_id:roomId});},[roomId]);

  async function joinVoice(password?:string){
    const client=supabase;
    if(!client||!room||busy||liveRoomRef.current)return;
    if(room.status==="closed"){setError("الغرفة مغلقة ولا يمكن الانضمام إليها.");return;}
    if(room.status==="locked"&&!canModerate){setError("الغرفة مقفلة حالياً.");return;}
    const attempt=++joinAttemptRef.current;
    setBusy(true);setError("");
    let pendingRoom:Room|null=null;
    try{
      const {error:joinError}=await client.rpc("jehoo_join_room",{p_room_id:room.id,p_password:password??null});
      if(joinError){
        if(String(joinError.message||"").includes("ROOM_PASSWORD_REQUIRED")){setPasswordModal(true);return;}
        throw joinError;
      }
      if(attempt!==joinAttemptRef.current){await client.rpc("jehoo_leave_room",{p_room_id:room.id});return;}
      const {data,error:tokenError}=await client.functions.invoke("livekit-token",{body:{roomName:room.livekit_room_name}});
      if(tokenError)throw tokenError;
      if(!data?.serverUrl||!data?.participantToken)throw new Error("Voice token response is incomplete.");
      if(attempt!==joinAttemptRef.current){await client.rpc("jehoo_leave_room",{p_room_id:room.id});return;}
      await AudioSession.startAudioSession();
      if(attempt!==joinAttemptRef.current){await AudioSession.stopAudioSession().catch(()=>undefined);await client.rpc("jehoo_leave_room",{p_room_id:room.id});return;}
      pendingRoom=new Room();
      await pendingRoom.connect(data.serverUrl,data.participantToken,{});
      if(attempt!==joinAttemptRef.current){try{await pendingRoom.disconnect()}catch{}pendingRoom=null;await AudioSession.stopAudioSession().catch(()=>undefined);await client.rpc("jehoo_leave_room",{p_room_id:room.id});return;}
      const canPublish=Boolean(data.canPublish);
      let microphoneStarted=false;
      if(canPublish){
        try{await pendingRoom.localParticipant.setMicrophoneEnabled(true);microphoneStarted=true;}
        catch{if(attempt===joinAttemptRef.current)Alert.alert("تم الاتصال بالصوت","الميكروفون غير متاح حالياً. يمكنك الاستماع، وتفعيل صلاحية المايك من إعدادات الجهاز.");}
      }
      if(attempt!==joinAttemptRef.current){try{await pendingRoom.disconnect()}catch{}pendingRoom=null;await AudioSession.stopAudioSession().catch(()=>undefined);await client.rpc("jehoo_leave_room",{p_room_id:room.id});return;}
      setMicEnabled(microphoneStarted);
      liveRoomRef.current=pendingRoom;
      const connectedRoom=pendingRoom;
      connectedRoom.on(RoomEvent.Disconnected,()=>{
        if(liveRoomRef.current!==connectedRoom)return;
        liveRoomRef.current=null;
        setLiveRoom(null);setLive(null);setMicEnabled(false);setChatMessages([]);setConversationId(null);
        void AudioSession.stopAudioSession().catch(()=>undefined);
        void client.rpc("jehoo_leave_room",{p_room_id:room.id}).then(({error:leaveError})=>{
          if(leaveError)setError(leaveError.message);
          else void loadRoom();
        });
      });
      setLiveRoom(pendingRoom);
      setLive({url:data.serverUrl,token:data.participantToken});
      pendingRoom=null;
      void loadRoom();
    }catch(e){
      if(pendingRoom){try{await pendingRoom.disconnect()}catch{}}
      await client.rpc("jehoo_leave_room",{p_room_id:room.id});
      if(attempt===joinAttemptRef.current)setError(e instanceof Error?e.message:"Unable to connect to the voice room.");
      await AudioSession.stopAudioSession().catch(()=>undefined);
    }finally{if(attempt===joinAttemptRef.current)setBusy(false)}
  }
  async function exitRoom(){
    joinAttemptRef.current+=1;
    const client=supabase;
    setChatMessages([]);
    setConversationId(null);
    if(live||liveRoomRef.current){
      await leaveVoice();
      router.replace("/");
      return;
    }
    if(client&&room){
      const {error:leaveError}=await client.rpc("jehoo_leave_room",{p_room_id:room.id});
      if(leaveError)setError(leaveError.message);
    }
    router.replace("/");
  }
  async function leaveVoice(){
    const client=supabase;
    const activeRoom=liveRoomRef.current;
    // Clear the ref before disconnecting so the Disconnected listener won't duplicate cleanup.
    liveRoomRef.current=null;
    try{await activeRoom?.disconnect()}catch{}
    setLiveRoom(null);setLive(null);setMicEnabled(false);
    await AudioSession.stopAudioSession().catch(()=>undefined);
    if(client&&room){
      const {error:leaveError}=await client.rpc("jehoo_leave_room",{p_room_id:room.id});
      if(leaveError)setError(leaveError.message);
      else{setMicRequestSent(false);void loadRoom()}
    }
  }
  async function handleMicrophoneRequest(requestId:string,accept:boolean){const client=supabase;if(!client)return;setHandlingRequest(requestId);setError("");try{const {data:decision,error:handleError}=await client.functions.invoke("room-microphone",{body:{requestId,accept}});if(handleError)throw handleError;if(decision?.error)throw new Error(String(decision.error));await loadRoom()}catch(e){setError(e instanceof Error?e.message:"تعذر معالجة طلب المايك")}finally{setHandlingRequest(null)}}
  async function requestMicrophone(){const client=supabase;if(!client||!room)return;setMicRequestBusy(true);setError("");try{const {error:requestError}=await client.rpc("jehoo_request_microphone",{p_room_id:room.id});if(requestError)throw requestError;setMicRequestSent(true)}catch(e){setError(e instanceof Error?e.message:"تعذر إرسال طلب المايك")}finally{setMicRequestBusy(false)}}

  async function roomAction(action:string,targetId:string){
    const client=supabase;
    if(!client||actingUser||!canModerate)return;
    setActingUser(targetId);setError("");
    try{
      if(!["lower","kick","mute","ban"].includes(action))throw new Error("إجراء غير معروف");
      const {data:result,error:actionError}=await client.functions.invoke("room-microphone",{body:{action,roomId,targetUserId:targetId}});
      if(actionError)throw actionError;
      if(result?.error)throw new Error(String(result.error));
      await loadRoom();
      if(result?.livekitAction==="refresh-required")setError("تم حفظ الإجراء، لكن تعذر تحديث الصوت مباشرة. قد يحتاج العضو إلى إعادة الاتصال.");
    }catch(e){setError(e instanceof Error?e.message:"تعذر تنفيذ الإجراء")}
    finally{setActingUser(null)}
  }
  async function setRole(targetId:string,role:string){const client=supabase;if(!client)return;setActingUser(targetId);setError("");try{const {error}=await client.rpc("jehoo_set_room_role",{p_room_id:roomId,p_target_user_id:targetId,p_role:role});if(error)throw error;await loadRoom()}catch(e){setError(e instanceof Error?e.message:"تعذر تغيير الصلاحية")}finally{setActingUser(null)}}

  async function toggleFollow(){
    if(!supabase||!currentUserId||!room?.owner_id)return;
    try{
      if(followed){const {error}=await supabase.from("user_follows").delete().eq("follower_id",currentUserId).eq("following_id",room.owner_id);if(error)throw error;setFollowed(false);}
      else{const {error}=await supabase.from("user_follows").insert({follower_id:currentUserId,following_id:room.owner_id});if(error)throw error;setFollowed(true);}
    }catch(e){setError(e instanceof Error?e.message:"تعذر تحديث المتابعة");}
  }
  async function takeSeat(seatNumber:number){
    if(!supabase||!room)return;
    setBusy(true);setError("");
    try{
      const {data:{user}}=await supabase.auth.getUser(); if(!user)throw new Error("سجّل الدخول أولاً");
      const {data:existing}=await supabase.from("room_seats").select("seat_number").eq("room_id",room.id).eq("user_id",user.id).eq("status","occupied").maybeSingle();
      if(existing?.seat_number===seatNumber){await loadRoom();return;}
      const {error}=await supabase.rpc("jehoo_request_seat",{p_room_id:room.id,p_seat_number:seatNumber});
      if(error)throw error; await loadRoom();
    }catch(e){setError(e instanceof Error?e.message:"تعذر الجلوس على المقعد");}
    finally{setBusy(false);}
  }
  async function toggleSeatLock(seatNumber:number,locked:boolean){
    if(!supabase||!canModerate)return;
    try{const {error}=await supabase.rpc("jehoo_set_seat_lock",{p_room_id:roomId,p_seat_number:seatNumber,p_locked:locked});if(error)throw error;await loadRoom();}
    catch(e){setError(e instanceof Error?e.message:"تعذر تغيير حالة المقعد");}
  }
  async function pickRoomCover(){
    if(!supabase||!room||!isHost)return;
    const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
    if(!permission.granted){Alert.alert("الصلاحية مطلوبة","اسمح للتطبيق بالوصول إلى الصور لاختيار غلاف الغرفة.");return;}
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsEditing:true,aspect:[16,9],quality:0.85,exif:false});
    if(result.canceled||!result.assets[0])return;
    setSettingsBusy(true);setError("");
    try{
      const asset=result.assets[0]; const response=await fetch(asset.uri); const blob=await response.blob();
      const ext=(asset.fileName?.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
      const path=room.id+"/cover-"+Date.now()+"."+ext;
      const {error:uploadError}=await supabase.storage.from("room-covers").upload(path,blob,{contentType:asset.mimeType||"image/jpeg",upsert:true});
      if(uploadError)throw uploadError;
      const {data}=supabase.storage.from("room-covers").getPublicUrl(path); setSettingsCover(data.publicUrl);
    }catch(e){setError(e instanceof Error?e.message:"تعذر رفع غلاف الغرفة");}finally{setSettingsBusy(false)}
  }

  async function saveRoomSettings(){
    if(!supabase||!room||!canModerate)return;
    setSettingsBusy(true);setError("");
    try{
      const {error}=await supabase.rpc("jehoo_update_room_settings",{p_room_id:room.id,p_name:settingsName,p_description:settingsDescription,p_cover_url:settingsCover||null,p_max_seats:Number(settingsSeats),p_password_enabled:settingsPasswordEnabled,p_password:settingsPassword||null,p_welcome_message:settingsWelcome});
      if(error)throw error; setSettingsPassword(""); await loadRoom(); Alert.alert("تم الحفظ","تم تحديث بيانات الغرفة.");
    }catch(e){setError(e instanceof Error?e.message:"تعذر حفظ إعدادات الغرفة");}
    finally{setSettingsBusy(false);}
  }
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

  const sortedSeats=useMemo(()=>Array.from({length:Math.min(room?.max_seats||10,10)},(_,i)=>seats.find(seat=>seat.seat_number===i+1)??({room_id:roomId,seat_number:i+1,status:"empty" as const,user_id:null,reserved_for:null})),[seats,roomId]);

  return <SafeAreaView edges={["top","left","right","bottom"]} style={s.page}>
    <Stack.Screen options={{title:room?.name??"JEHOO CHAT",headerShown:false}}/>
    {loading?<View style={s.center}><ActivityIndicator color="#5FFFE0"/><Text style={s.loadingText}>جاري فتح الغرفة...</Text></View>:error&&!room?<View style={s.center}><Text style={s.error}>{error}</Text><Pressable onPress={()=>void loadRoom()} style={s.retry}><Text style={s.retryText}>إعادة المحاولة</Text></Pressable></View>:<>
      <ScrollView contentContainerStyle={s.roomContent} showsVerticalScrollIndicator={false}>
        <View style={s.roomTop}>
          <Pressable onPress={()=>Alert.alert("مغادرة الغرفة","هل تريد مغادرة الغرفة؟",[ {text:"إلغاء",style:"cancel"},{text:"مغادرة",style:"destructive",onPress:()=>void exitRoom()} ])} style={s.power}><Text style={s.powerText}>⏻</Text></Pressable>
          <View style={s.ownerCard}>
            <View style={s.ownerAvatar}>{ownerProfile?.avatar_url?<Image source={{uri:ownerProfile.avatar_url}} style={s.ownerImage}/>:<Text style={s.ownerAvatarText}>👤</Text>}</View>
            <View style={s.ownerText}><Text style={s.ownerName} numberOfLines={1}>{ownerProfile?.display_name||"مالك الغرفة"}</Text><Text style={s.ownerId}>ID: {ownerProfile?.id?.slice(0,8)??"—"}</Text></View>
            {currentUserId&&currentUserId!==room?.owner_id?<Pressable onPress={()=>void toggleFollow()} style={s.follow}><Text style={s.followText}>{followed?"متابَع":"متابعة"}</Text></Pressable>:null}
          </View>
          <View style={s.onlinePill}><Text style={s.onlineText}>👤 {seats.filter(x=>x.status==="occupied").length}</Text></View>
          <View style={s.roomTitleBlock}><Text style={s.roomTitle}>{room?.name}</Text><Text style={s.roomSubtitle}>{room?.status==="locked"?"🔒 غرفة مقفلة":room?.description||"غرفة صوتية اجتماعية"}</Text></View>
        </View>

        <View style={s.score}><Text style={s.scoreText}>0 🏆</Text></View>

        <View style={s.seatArea}>
          <View style={s.seatGrid}>
            {sortedSeats.map(seat=>{
              const person=seat.user_id?profiles[seat.user_id]:null;
              const occupied=seat.status==="occupied"&&Boolean(person);
              const label=seat.status==="locked"?"🔒":person?.display_name?.slice(0,1)??"🪑";
              return <Pressable key={seat.seat_number} onPress={()=>{
                if(person){openMemberActions(person.id,person.display_name);}
                else if(seat.status==="locked"){if(canModerate)Alert.alert("المقعد مقفل","فتح المقعد؟",[ {text:"إلغاء",style:"cancel"},{text:"فتح",onPress:()=>void toggleSeatLock(seat.seat_number,false)} ]);}
                else if(canModerate)Alert.alert("المقعد "+seat.seat_number,"اختر الإجراء",[ {text:"الجلوس",onPress:()=>void takeSeat(seat.seat_number)},{text:"قفل المقعد",onPress:()=>void toggleSeatLock(seat.seat_number,true)},{text:"إلغاء",style:"cancel"} ]);
                else void takeSeat(seat.seat_number);
              }} style={[s.seat,occupied&&s.seatOccupied,seat.status==="locked"&&s.seatLocked]}>
                <View style={[s.avatar,occupied&&s.avatarSpeaking]}>{person?.avatar_url?<Image source={{uri:person.avatar_url}} style={s.seatImage}/>:<Text style={s.avatarText}>{label}</Text>}</View>
                <Text numberOfLines={1} style={s.seatNumber}>{seat.seat_number}</Text>
                <Text numberOfLines={1} style={s.seatName}>{person?.display_name??(seat.status==="locked"?"مقفل":"مقعد")}</Text>
              </Pressable>;
            })}
          </View>
        </View>

        <View style={s.welcomeBubble}><Text style={s.welcomeText}>{room?.welcome_message}</Text></View>

        {error?<Text style={s.error}>{error}</Text>:null}

        {live?<View style={s.voiceBar}><View><Text style={s.voiceTitle}>🎙 الصوت مباشر</Text><Text style={s.voiceSub}>{micEnabled?"الميكروفون مفتوح":"الميكروفون مكتوم"}</Text></View><Pressable onPress={async()=>{const next=!micEnabled;try{await liveRoom?.localParticipant.setMicrophoneEnabled(next);setMicEnabled(next)}catch(e){setError(e instanceof Error?e.message:"تعذر التحكم بالمايك")}}} style={s.micToggle}><Text style={s.micToggleText}>{micEnabled?"🔊":"🔇"}</Text></Pressable><Pressable onPress={()=>void leaveVoice()} style={s.leaveVoice}><Text style={s.leaveVoiceText}>مغادرة</Text></Pressable></View>:null}

        <View style={s.roomTabs}>
          {([{id:"all",label:"الكل",icon:"⌂"},{id:"chat",label:"دردشة",icon:"💬"},{id:"gifts",label:"هدية",icon:"🎁"},{id:"enter",label:"ادخل",icon:"🎙"}] as const).map(tab=><Pressable key={tab.id} onPress={()=>{setRoomTab(tab.id);if(tab.id==="enter"&&!live)void joinVoice();}} style={[s.roomTab,roomTab===tab.id&&s.roomTabActive]}><Text style={[s.roomTabIcon,roomTab===tab.id&&s.roomTabTextActive]}>{tab.icon}</Text><Text style={[s.roomTabText,roomTab===tab.id&&s.roomTabTextActive]}>{tab.label}</Text></Pressable>)}
        </View>

        {roomTab==="chat"?<View style={s.tabNotice}><Text style={s.tabNoticeTitle}>دردشة الغرفة</Text>{!isRoomParticipant?<Text style={s.tabNoticeText}>انضم إلى الغرفة أولاً حتى تقدر ترسل وتستقبل رسائلها.</Text>:null}<ScrollView style={s.chatList} nestedScrollEnabled contentContainerStyle={{gap:8}}>{chatMessages.map((m:any)=><View key={m.id} style={s.chatBubble}><Text style={s.chatSender}>{m.profiles?.display_name||"مستخدم"}</Text><Text style={s.chatBody}>{m.body}</Text></View>)}</ScrollView><View style={s.chatComposer}><TextInput value={chatDraft} onChangeText={setChatDraft} placeholder="اكتب رسالتك..." placeholderTextColor="#82A99D" maxLength={1000} style={s.chatInput}/><Pressable disabled={!chatDraft.trim()||chatBusy||!conversationId} onPress={()=>void sendRoomMessage()} style={s.chatSend}><Text style={s.chatSendText}>إرسال</Text></Pressable></View></View>
        :roomTab==="gifts"?<View style={s.tabNotice}><Text style={s.tabNoticeTitle}>🎁 الهدايا</Text><Text style={s.giftBalance}>رصيدك: {walletCoins===null?"—":walletCoins.toLocaleString()} عملة</Text>{giftRecipients.length===0?<Text style={s.tabNoticeText}>لا يوجد عضو آخر في الغرفة لإرسال هدية إليه حالياً.</Text>:null}<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.giftChoices}>{giftRecipients.map(person=><Pressable key={person.id} onPress={()=>setSelectedRecipient(person.id)} style={[s.giftRecipient,selectedRecipient===person.id&&s.giftRecipientActive]}><Text style={s.giftRecipientText}>{person.name}</Text></Pressable>)}</ScrollView><View style={s.giftChoices}>{giftCatalog.map(g=><Pressable key={g.gift_key} disabled={!selectedRecipient||giftBusy} onPress={()=>void sendRoomGift(g.gift_key)} style={s.giftCard}><Text style={s.giftEmoji}>{g.emoji}</Text><Text style={s.giftTitle}>{g.title}</Text><Text style={s.giftPrice}>{g.price}</Text></Pressable>)}</View></View>
        :roomTab==="enter"?<View style={s.tabNotice}><Text style={s.tabNoticeTitle}>🎙 الدخول للصوت</Text><Text style={s.tabNoticeText}>ادخل للغرفة وفعّل المايك للتحدث مع الموجودين.</Text><Pressable onPress={()=>live?void requestMicrophone():void joinVoice()} style={s.primary}><Text style={s.primaryText}>{live?"طلب المايك":"الانضمام للصوت"}</Text></Pressable></View>:null}

        {canModerate?<View style={s.adminPanel}><Pressable style={s.adminHead} onPress={()=>setShowAdmin(v=>!v)}><View><Text style={s.adminTitle}>⚙️ إعدادات الغرفة</Text><Text style={s.adminSub}>الاسم · المقاعد · كلمة السر · الرسالة</Text></View><Text style={s.chevron}>{showAdmin?"⌃":"⌄"}</Text></Pressable>{showAdmin?<View style={s.adminBody}><TextInput value={settingsName} onChangeText={setSettingsName} placeholder="اسم الغرفة" placeholderTextColor="#718096" style={s.adminInput}/><TextInput value={settingsDescription} onChangeText={setSettingsDescription} placeholder="وصف الغرفة" placeholderTextColor="#718096" style={s.adminInput}/><View style={s.coverRow}>{settingsCover?<Image source={{uri:settingsCover}} style={s.coverPreview}/>:<Text style={s.coverEmpty}>لا يوجد غلاف</Text>}<Pressable onPress={()=>void pickRoomCover()} style={s.coverButton}><Text style={s.coverButtonText}>تغيير الغلاف</Text></Pressable></View><TextInput value={settingsSeats} onChangeText={setSettingsSeats} keyboardType="number-pad" placeholder="عدد المقاعد (1-10)" placeholderTextColor="#718096" style={s.adminInput}/><Pressable onPress={()=>setSettingsPasswordEnabled(v=>!v)} style={s.settingToggle}><Text style={s.settingToggleText}>{settingsPasswordEnabled?"🔒 كلمة السر مفعلة":"🔓 كلمة السر غير مفعلة"}</Text></Pressable>{settingsPasswordEnabled?<TextInput value={settingsPassword} onChangeText={setSettingsPassword} secureTextEntry placeholder="كلمة سر جديدة" placeholderTextColor="#718096" style={s.adminInput}/>:null}<TextInput value={settingsWelcome} onChangeText={setSettingsWelcome} placeholder="رسالة الترحيب" placeholderTextColor="#718096" multiline style={[s.adminInput,{minHeight:70}]}/><View style={s.statusRow}><Pressable onPress={()=>void changeRoomStatus("active")} style={s.statusButton}><Text style={s.statusText}>فتح</Text></Pressable><Pressable onPress={()=>void changeRoomStatus("locked")} style={s.statusButton}><Text style={s.statusText}>قفل</Text></Pressable><Pressable onPress={()=>Alert.alert("إغلاق الغرفة","هل أنت متأكد؟",[ {text:"إلغاء",style:"cancel"},{text:"إغلاق",style:"destructive",onPress:()=>void changeRoomStatus("closed")} ])} style={[s.statusButton,{backgroundColor:"#5A2830"}]}><Text style={s.statusText}>إغلاق</Text></Pressable></View><Pressable disabled={settingsBusy} onPress={()=>void saveRoomSettings()} style={s.saveSettings}>{settingsBusy?<ActivityIndicator color="#06251E"/>:<Text style={s.saveSettingsText}>حفظ التعديلات</Text>}</Pressable></View>:null}</View>:null}
      </ScrollView>

      <View style={[s.roomDock,{bottom:Math.max(8,insets.bottom+4)}]}>
        <Pressable onPress={()=>void exitRoom()} style={s.dockButton}><Text style={s.dockIcon}>↩</Text><Text style={s.dockLabel}>رجوع</Text></Pressable>
        <Pressable onPress={()=>void exitRoom()} style={s.dockButton}><Text style={s.dockIcon}>⌂</Text><Text style={s.dockLabel}>هوم</Text></Pressable>
        <Pressable onPress={()=>setRoomTab("chat")} style={s.dockButton}><Text style={s.dockIcon}>✉</Text><Text style={s.dockLabel}>رسائل</Text></Pressable>
        <Pressable onPress={()=>setRoomTab("gifts")} style={s.giftDock}><Text style={{fontSize:24}}>🎁</Text></Pressable>
        <Pressable onPress={()=>setRoomTab("enter")} style={s.dockButton}><Text style={s.dockIcon}>🎙</Text><Text style={s.dockLabel}>ادخل</Text></Pressable>
      </View>

      {live?<LiveKitRoom room={liveRoom??undefined} serverUrl={live.url} token={live.token} connect={false} audio={false} video={false}/>:null}
      <Modal visible={passwordModal} transparent animationType="fade" onRequestClose={()=>setPasswordModal(false)}><View style={s.modalBackdrop}><View style={s.passwordCard}><Text style={s.modalTitle}>الغرفة محمية بكلمة سر</Text><Text style={s.modalText}>أدخل كلمة السر للدخول.</Text><TextInput value={joinPassword} onChangeText={setJoinPassword} secureTextEntry placeholder="كلمة السر" placeholderTextColor="#8AA39A" style={s.passwordInput}/><View style={s.modalRow}><Pressable onPress={()=>{setPasswordModal(false);setJoinPassword("")}} style={s.modalCancel}><Text style={s.modalCancelText}>إلغاء</Text></Pressable><Pressable onPress={()=>{setPasswordModal(false);void joinVoice(joinPassword);}} style={s.modalConfirm}><Text style={s.modalConfirmText}>دخول</Text></Pressable></View></View></View></Modal>
    </>}
  </SafeAreaView>;
}
const s=StyleSheet.create({roomContent:{paddingHorizontal:14,paddingTop:8,paddingBottom:128,gap:14},roomTop:{minHeight:108,position:"relative",alignItems:"center"},ownerCard:{position:"absolute",left:0,top:0,right:64,height:62,borderRadius:22,backgroundColor:"rgba(0,35,29,0.82)",borderWidth:1,borderColor:"#185849",flexDirection:"row",alignItems:"center",paddingHorizontal:9,gap:8},ownerText:{flex:1},onlinePill:{position:"absolute",left:8,top:68,backgroundColor:"#06251F",borderRadius:15,paddingHorizontal:10,paddingVertical:5,borderWidth:1,borderColor:"#185849"},onlineText:{color:"#B8F8E5",fontSize:11,fontWeight:"900"},roomTitleBlock:{alignItems:"center",paddingTop:78,maxWidth:"72%"},roomTitle:{color:"#F2FFF9",fontSize:20,fontWeight:"900"},roomSubtitle:{color:"#83B6A8",fontSize:11,textAlign:"center",marginTop:3},seatArea:{backgroundColor:"rgba(0,54,43,0.45)",borderRadius:28,borderWidth:1,borderColor:"#145747",paddingHorizontal:7,paddingVertical:16},seatGrid:{flexDirection:"row-reverse",flexWrap:"wrap",justifyContent:"space-between",rowGap:12},avatarSpeaking:{borderColor:"#5FFFE0",borderWidth:3,shadowColor:"#5FFFE0",shadowOpacity:0.8,shadowRadius:9},voiceBar:{backgroundColor:"rgba(0,54,43,0.88)",borderRadius:18,borderWidth:1,borderColor:"#21755F",padding:10,flexDirection:"row-reverse",alignItems:"center",gap:10},voiceTitle:{color:"#E7FFF5",fontWeight:"900"},voiceSub:{color:"#7DE7D0",fontSize:10,marginTop:2},leaveVoice:{backgroundColor:"#5A2830",borderRadius:12,paddingHorizontal:12,paddingVertical:9},leaveVoiceText:{color:"#FFD4DA",fontWeight:"800"},loadingText:{color:"#83B6A8"},retry:{backgroundColor:"#31D6B0",borderRadius:12,padding:12},retryText:{color:"#06251E",fontWeight:"900"},roomTabIcon:{fontSize:17},
 page:{flex:1,backgroundColor:"#042D26"},roomOwner:{flex:1,flexDirection:"row",alignItems:"center",gap:8},ownerAvatar:{width:42,height:42,borderRadius:21,backgroundColor:"#0B493B",alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"#3A8B76"},ownerAvatarText:{fontSize:19},ownerImage:{width:40,height:40,borderRadius:20},ownerName:{color:"#F2FFF9",fontWeight:"900",fontSize:13},ownerId:{color:"#8DBBAF",fontSize:9,marginTop:2},follow:{backgroundColor:"#31D6B0",borderRadius:16,paddingHorizontal:12,paddingVertical:7,marginLeft:6},followText:{color:"#06251E",fontSize:10,fontWeight:"900"},power:{width:48,height:48,borderRadius:24,backgroundColor:"#EEF5F2",alignItems:"center",justifyContent:"center",elevation:4},powerText:{color:"#53615D",fontSize:22},score:{position:"absolute",right:14,top:12,backgroundColor:"#0B211D",borderWidth:1,borderColor:"#7C6330",borderRadius:16,paddingHorizontal:10,paddingVertical:5},scoreText:{color:"#F5C95D",fontWeight:"900",fontSize:11},header:{flexDirection:"row-reverse",alignItems:"center",gap:12,paddingHorizontal:18,paddingTop:6,paddingBottom:16,borderBottomWidth:1,borderBottomColor:"#155447"},back:{paddingVertical:10,paddingHorizontal:8},backText:{color:"#71E8C9",fontWeight:"800"},title:{color:"#F2FFF9",fontWeight:"900",fontSize:20},subtitle:{color:"#9BC5B8",fontSize:12,marginTop:5},content:{padding:16,paddingBottom:130,gap:20},stage:{alignItems:"center",backgroundColor:"#073B30",borderRadius:24,borderWidth:1,borderColor:"#1B715B",padding:22,gap:12},stageEmoji:{fontSize:44},stageTitle:{color:"#F2FFF9",fontWeight:"900",fontSize:21},primary:{backgroundColor:"#31D6B0",borderRadius:12,minHeight:44,minWidth:170,paddingHorizontal:18,alignItems:"center",justifyContent:"center"},primaryText:{color:"#06251E",fontWeight:"800"},connected:{alignItems:"center",gap:12},connectedText:{color:"#31D6B0"},micToggle:{backgroundColor:"#0B493B",borderRadius:16,paddingHorizontal:12,paddingVertical:7,borderWidth:1,borderColor:"#2C7866"},micToggleText:{color:"#C8FFF1",fontSize:11,fontWeight:"800"},section:{gap:14},sectionTitle:{fontSize:18,fontWeight:"900",color:"#E7FFF5",textAlign:"right"},seatHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},countPill:{backgroundColor:"#0B211D",borderRadius:16,paddingHorizontal:10,paddingVertical:6},countText:{color:"#7DE7D0",fontWeight:"900",fontSize:11},helper:{color:"#85B5A7",fontSize:11,textAlign:"right"},welcomeBubble:{backgroundColor:"rgba(10,35,30,0.86)",borderRadius:18,borderWidth:1,borderColor:"#725D31",padding:12,marginTop:4},welcomeText:{color:"#F5D57A",fontSize:12,textAlign:"right",lineHeight:20},grid:{flexDirection:"row-reverse",flexWrap:"wrap",justifyContent:"space-between",gap:10},seat:{width:"18.2%",minHeight:108,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(11,73,59,0.78)",borderWidth:1,borderColor:"#236B59",borderRadius:42,padding:5,gap:3,marginBottom:4},seatLocked:{borderColor:"#64756F",backgroundColor:"#17342D"},seatOccupied:{borderColor:"#48E3BD",backgroundColor:"#0D5A47"},avatar:{width:56,height:56,borderRadius:28,alignItems:"center",justifyContent:"center",backgroundColor:"#155849",borderWidth:1,borderColor:"#4A9C83",overflow:"hidden"},seatImage:{width:"100%",height:"100%"},avatarText:{fontSize:19,color:"#DFFCF3",fontWeight:"900"},seatNumber:{fontSize:11,color:"#F5C95D",fontWeight:"900"},seatName:{fontSize:9,color:"#D7F6EB",maxWidth:"100%",fontWeight:"700"},vip:{fontSize:9,color:"#F5CB74",fontWeight:"800"},level:{fontSize:9,color:"#94A3B8"},requestRow:{flexDirection:"row",alignItems:"center",gap:8,backgroundColor:"#121B25",padding:12,borderRadius:12,borderWidth:1,borderColor:"#263342"},requestName:{color:"#F2F7FA",fontWeight:"700",textAlign:"right"},requestSub:{color:"#94A3B8",fontSize:11,textAlign:"right",marginTop:3},rejectButton:{paddingVertical:9,paddingHorizontal:12,borderRadius:10,backgroundColor:"#40242A"},rejectText:{color:"#FDA4AF",fontWeight:"800"},acceptButton:{minWidth:60,alignItems:"center",justifyContent:"center",paddingVertical:9,paddingHorizontal:12,borderRadius:10,backgroundColor:"#31D6B0"},acceptText:{color:"#06251E",fontWeight:"800"},adminBadge:{backgroundColor:"#142A2A",borderRadius:12,padding:12,borderWidth:1,borderColor:"#2D6B60"},adminBadgeText:{color:"#7DE7D0",fontWeight:"800",textAlign:"right"},adminPanel:{backgroundColor:"#101923",borderRadius:18,borderWidth:1,borderColor:"#2A3A49",overflow:"hidden"},adminHead:{padding:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},adminTitle:{color:"#F2F7FA",fontWeight:"900",fontSize:17},adminSub:{color:"#718096",fontSize:11,marginTop:4},adminBody:{padding:14,gap:10,borderTopWidth:1,borderTopColor:"#263342"},chevron:{color:"#31D6B0",fontSize:22},label:{color:"#CBD5E1",fontWeight:"800",textAlign:"right"},row:{flexDirection:"row",justifyContent:"flex-end",gap:8},small:{backgroundColor:"#31D6B0",borderRadius:9,paddingHorizontal:11,paddingVertical:8},smallText:{color:"#06251E",fontWeight:"800",fontSize:11},danger:{backgroundColor:"#40242A",borderRadius:9,paddingHorizontal:11,paddingVertical:8},dangerText:{color:"#FDA4AF",fontWeight:"800",fontSize:11},member:{flexDirection:"row",alignItems:"center",gap:8,backgroundColor:"#121B25",padding:10,borderRadius:12,borderWidth:1,borderColor:"#263342"},memberName:{color:"#F2F7FA",fontWeight:"700",textAlign:"right"},memberRole:{color:"#94A3B8",fontSize:10,textAlign:"right",marginTop:3},manage:{borderWidth:1,borderColor:"#31D6B0",borderRadius:9,paddingHorizontal:10,paddingVertical:7},manageText:{color:"#31D6B0",fontWeight:"800",fontSize:11},bans:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},empty:{color:"#64748B",fontSize:12,textAlign:"right"},center:{alignItems:"center",padding:30,gap:12},error:{color:"#FDA4AF",textAlign:"center"},mint:{color:"#31D6B0"},roomTabs:{flexDirection:"row-reverse",justifyContent:"flex-start",gap:22,paddingVertical:8,borderBottomWidth:1,borderBottomColor:"#155447"},roomTab:{paddingVertical:8,borderBottomWidth:3,borderBottomColor:"transparent"},roomTabActive:{borderBottomColor:"#31D6B0"},roomTabText:{fontSize:14,color:"#86A99F",fontWeight:"700"},roomTabTextActive:{color:"#55E6C3"},tabNotice:{backgroundColor:"#073B30",borderColor:"#1B715B",borderWidth:1,borderRadius:18,padding:16,gap:10},tabNoticeTitle:{color:"#E7FFF5",fontSize:17,fontWeight:"900",textAlign:"right"},tabNoticeText:{color:"#9BC5B8",fontSize:13,textAlign:"right",lineHeight:21},chatList:{maxHeight:300,minHeight:100},chatBubble:{alignSelf:"stretch",backgroundColor:"#0B493B",borderRadius:12,padding:10,borderWidth:1,borderColor:"#236B59",gap:4},chatSender:{color:"#65E3C3",fontSize:12,fontWeight:"900",textAlign:"right"},chatBody:{color:"#E7FFF5",fontSize:14,textAlign:"right",lineHeight:20},chatTime:{color:"#85B5A7",fontSize:10,textAlign:"left"},chatComposer:{flexDirection:"row-reverse",alignItems:"center",gap:8},chatInput:{flex:1,minHeight:42,maxHeight:100,borderRadius:12,backgroundColor:"#042D26",borderWidth:1,borderColor:"#236B59",color:"#F2FFF9",paddingHorizontal:12,paddingVertical:8,textAlign:"right"},chatSend:{backgroundColor:"#31D6B0",borderRadius:11,paddingHorizontal:14,paddingVertical:12},chatSendText:{color:"#06251E",fontWeight:"900"},giftBalance:{color:"#65E3C3",fontWeight:"900",textAlign:"right"},giftLabel:{color:"#E7FFF5",fontWeight:"900",textAlign:"right",marginTop:4},giftChoices:{flexDirection:"row",flexWrap:"wrap",gap:8,justifyContent:"flex-end"},giftRecipient:{backgroundColor:"#042D26",borderWidth:1,borderColor:"#236B59",borderRadius:12,padding:10},giftRecipientActive:{borderColor:"#31D6B0",backgroundColor:"#0D5A47"},giftRecipientText:{color:"#E7FFF5",fontWeight:"700"},giftCard:{minWidth:90,alignItems:"center",backgroundColor:"#042D26",borderWidth:1,borderColor:"#236B59",borderRadius:14,padding:12,gap:5},giftEmoji:{fontSize:28},giftTitle:{color:"#E7FFF5",fontWeight:"800"},giftPrice:{color:"#65E3C3",fontSize:11,fontWeight:"800"},roomDock:{position:"absolute",left:14,right:14,backgroundColor:"#06382E",borderWidth:1,borderColor:"#1B715B",borderRadius:26,paddingVertical:10,paddingHorizontal:12,flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-around",elevation:8},dockButton:{alignItems:"center",justifyContent:"center",minWidth:55,gap:3},dockIcon:{color:"#B8F8E5",fontSize:23,fontWeight:"800"},dockLabel:{color:"#9BC5B8",fontSize:10,fontWeight:"700"},modalBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,0.65)",alignItems:"center",justifyContent:"center",padding:24},passwordCard:{width:"100%",maxWidth:420,backgroundColor:"#073B30",borderRadius:22,borderWidth:1,borderColor:"#2B7D68",padding:20,gap:12},modalTitle:{color:"#F2FFF9",fontSize:18,fontWeight:"900",textAlign:"right"},modalText:{color:"#A8CFC3",fontSize:12,textAlign:"right"},passwordInput:{backgroundColor:"#042D26",borderWidth:1,borderColor:"#236B59",borderRadius:12,color:"#F2FFF9",padding:12,textAlign:"right"},modalRow:{flexDirection:"row",gap:10,justifyContent:"flex-start"},modalCancel:{flex:1,borderWidth:1,borderColor:"#396A5D",borderRadius:12,padding:12,alignItems:"center"},modalCancelText:{color:"#A8CFC3",fontWeight:"800"},modalConfirm:{flex:1,backgroundColor:"#31D6B0",borderRadius:12,padding:12,alignItems:"center"},modalConfirmText:{color:"#06251E",fontWeight:"900"},adminInput:{backgroundColor:"#0B211D",borderWidth:1,borderColor:"#315C51",borderRadius:10,color:"#F2FFF9",paddingHorizontal:11,paddingVertical:9,textAlign:"right"},settingToggle:{backgroundColor:"#0B493B",borderRadius:10,padding:11},settingToggleText:{color:"#7DE7D0",fontWeight:"800",textAlign:"right"},saveSettings:{backgroundColor:"#31D6B0",borderRadius:10,padding:11,alignItems:"center"},coverRow:{flexDirection:"row-reverse",alignItems:"center",gap:8},coverPreview:{width:72,height:42,borderRadius:10},coverEmpty:{flex:1,color:"#718096",textAlign:"right"},coverButton:{backgroundColor:"#123F35",paddingHorizontal:12,paddingVertical:9,borderRadius:12},coverButtonText:{color:"#B8F8E5",fontWeight:"800"},statusRow:{flexDirection:"row-reverse",gap:8},statusButton:{flex:1,backgroundColor:"#155849",borderRadius:10,paddingVertical:10,alignItems:"center"},statusText:{color:"#E7FFF5",fontWeight:"900"},saveSettingsText:{color:"#06251E",fontWeight:"900"},giftDock:{width:56,height:56,borderRadius:28,backgroundColor:"#6E49E8",borderWidth:2,borderColor:"#8EEFD7",alignItems:"center",justifyContent:"center",marginTop:-22}
});