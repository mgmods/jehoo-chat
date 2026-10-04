import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { messages, type Locale } from "../../packages/shared/src/index";
import ProfileOnboarding from "@/components/ProfileOnboarding";

WebBrowser.maybeCompleteAuthSession();

type Room = { id: string; name: string; description: string; status: "active" | "locked" | "closed"; is_featured: boolean; created_at: string };

export default function HomeScreen() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ar");
  const [session, setSession] = useState<Session | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [tab, setTab] = useState<"rooms" | "chats" | "me">("rooms");
  const copy = messages[locale];
  const ar = locale === "ar";

  useEffect(() => {
    const client = supabase;
    if (!client) { setLoading(false); setError(copy.configurationRequired); return; }
    let active = true;
    client.auth.getSession().then(async ({ data, error: authError }) => {
      if (!active) return;
      if (authError) setError(authError.message);
      setSession(data.session);
      if (data.session?.user) {
        const { data: profileData } = await client.from("profiles").select("id,public_id,first_name,nickname,gender,birth_date,country,avatar_url,profile_completed").eq("id", data.session.user.id).maybeSingle();
        if (active) setProfile(profileData);
      } else {
        setProfile(null);
      }
      if (active) setProfileLoading(false);
    }).catch((authError: unknown) => {
      if (active) { setError(authError instanceof Error ? authError.message : "Authentication initialization failed."); setProfileLoading(false); }
    });
    const { data: { subscription } } = client.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (nextSession?.user) {
        const { data: profileData } = await client.from("profiles").select("id,public_id,first_name,nickname,gender,birth_date,country,avatar_url,profile_completed").eq("id", nextSession.user.id).maybeSingle();
        if (active) setProfile(profileData);
      } else {
        setProfile(null);
      }
      if (active) setProfileLoading(false);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [copy.configurationRequired]);



  const loadRooms = useCallback(async () => {
    const client = supabase;
    if (!client || !session) { setRooms([]); setLoading(false); return; }
    setLoading(true); setError("");
    const { data, error: queryError } = await client.from("rooms")
      .select("id,name,description,status,is_featured,created_at")
      .neq("status", "closed").order("is_featured", { ascending: false }).order("created_at", { ascending: false }).limit(30);
    if (queryError) setError(queryError.message);
    else setRooms((data ?? []) as Room[]);
    setLoading(false);
  }, [session]);

  useEffect(() => { void loadRooms(); }, [loadRooms]);

  async function signIn() {
    const client = supabase;
    if (!client) { setError(copy.configurationRequired); return; }
    setError("");
    setAuthBusy(true);
    try {
      const redirectTo = makeRedirectUri({ scheme: "jehoochat", path: "auth/callback" });
      const { data, error: oauthError } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (oauthError) throw oauthError;
      if (!data.url) throw new Error(ar ? "تعذّر بدء تسجيل الدخول." : "Could not start sign-in.");
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== "success" || !result.url) return;
      const callback = new URL(result.url);
      const params = new URLSearchParams(callback.search);
      const hashParams = new URLSearchParams(callback.hash.startsWith("#") ? callback.hash.slice(1) : callback.hash);
      const accessToken = params.get("access_token") ?? hashParams.get("access_token");
      const refreshToken = params.get("refresh_token") ?? hashParams.get("refresh_token");
      const code = params.get("code");
      if (code) {
        const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      } else if (accessToken && refreshToken) {
        const { error: sessionError } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (sessionError) throw sessionError;
      } else {
        const authError = params.get("error_description") ?? hashParams.get("error_description");
        if (authError) throw new Error(authError);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "فشل تسجيل الدخول." : "Sign-in failed."));
    } finally {
      setAuthBusy(false);
    }
  }
  async function createRoom() {
    const client = supabase;
    if (!client) return;
    const name = roomName.trim();
    if (name.length < 2 || name.length > 80) {
      setError(ar ? "اسم الغرفة يجب أن يكون بين حرفين و80 حرفاً." : "Room name must be between 2 and 80 characters.");
      return;
    }
    if (roomDescription.trim().length > 500) {
      setError(ar ? "الوصف يجب ألا يتجاوز 500 حرف." : "Description must be 500 characters or less.");
      return;
    }
    setCreateBusy(true); setError("");
    try {
      const { data, error: createError } = await client.rpc("jehoo_create_room", { p_name: name, p_description: roomDescription.trim() });
      if (createError) throw createError;
      const created = data as { id?: string } | null;
      if (!created?.id) throw new Error(ar ? "لم يصل معرّف الغرفة من الخادم." : "No room ID returned from server.");
      setRoomName(""); setRoomDescription(""); setShowCreateRoom(false);
      await loadRooms();
      router.push({ pathname: "/room/[id]", params: { id: created.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "تعذر إنشاء الغرفة." : "Could not create room."));
    } finally { setCreateBusy(false); }
  }

  async function refreshProfile() {
    if (!supabase || !session?.user) return;
    const { data } = await supabase.from("profiles").select("id,first_name,nickname,gender,birth_date,country,avatar_url,profile_completed").eq("id", session.user.id).maybeSingle();
    setProfile(data);
  }

  async function openPersonalRoom() {
    if (!supabase) return;
    setError("");
    const { data, error: roomError } = await supabase.rpc("jehoo_get_or_create_personal_room");
    if (roomError || !data?.id) { setError(roomError?.message ?? (ar ? "تعذر تجهيز رومك الشخصي." : "Could not prepare your personal room.")); return; }
    router.push({ pathname: "/room/[id]", params: { id: data.id } });
  }

  async function signOut() {
    const client = supabase;
    if (!client) return;
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) setError(signOutError.message);
  }

  return <SafeAreaView style={s.safe}>
    <View style={s.header}>
      <View><Text style={s.brand}>JEHOO <Text style={s.mint}>●</Text> CHAT</Text><Text style={s.subtitle}>{ar ? "مساحتك، صوتك، أصدقاؤك" : "Your space, your voice, your friends"}</Text></View>
      <Pressable style={s.language} onPress={() => setLocale(ar ? "en" : "ar")}><Text style={s.languageText}>{ar ? "English" : "العربية"}</Text></Pressable>
    </View>
    {profileLoading ? <View style={s.hero}><ActivityIndicator color="#31D6B0" /><Text style={s.subtitle}>جارٍ تجهيز حسابك…</Text></View> : session && !profile?.profile_completed ? <ProfileOnboarding user={session.user} initialProfile={profile} onComplete={() => void refreshProfile()} /> : !session ? <View style={s.hero}>
      <Text style={s.eyebrow}>{ar ? "مساحتك، صوتك، أصدقاؤك" : "Your space, your voice, your friends"}</Text>
      <Text style={s.heroTitle}>{ar ? "أهلاً بك في جيهو" : "Welcome to JEHOO"}</Text>
      <Text style={s.body}>{ar ? "سجّل الدخول لعرض الغرف الحقيقية المرتبطة بحسابك." : "Sign in to discover live rooms connected to your account."}</Text>
      <Pressable disabled={authBusy} onPress={signIn} style={s.primary}>{authBusy ? <ActivityIndicator color="#06251E" /> : <Text style={s.primaryText}>{ar ? "المتابعة باستخدام Google" : "Continue with Google"}</Text>}</Pressable>
    </View> : <>
      <View style={s.topLinks}>
        <Text style={s.brand}>{ar ? "حفلة" : "Party"} <Text style={s.mint}>ملكي</Text> {ar ? "الفعاليات" : "Events"}</Text>
        <View style={s.quickIcons}><Text style={s.quickIcon}>⌂</Text><Text style={s.quickIcon}>⌕</Text><Text style={s.quickIcon}>🎉</Text></View>
      </View>
      <View style={s.banner}>
        <View style={s.bannerGlow}><Text style={s.bannerKicker}>JEHOO ✦ LIVE</Text><Text style={s.bannerTitle}>{ar ? "مكافآت الشحن" : "Recharge Rewards"}</Text><Text style={s.bannerText}>{ar ? "ادخل غرفتك المفضلة وتعرّف على أصدقاء جدد" : "Join your favorite rooms and meet new friends"}</Text><View style={s.bannerPill}><Text style={s.bannerPillText}>{ar ? "اكتشف الآن  ←" : "Explore now  →"}</Text></View></View>
      </View>
      <View style={s.categoryRow}>{[[ "👑", ar ? "ثراء" : "Rich", "#F3B54A"],["💎", "CP", "#A44CF0"],["🏆", ar ? "قربي" : "Nearby", "#3997E8"]].map(([emoji,label,color])=><Pressable key={label} style={[s.categoryCard,{backgroundColor:color+"22",borderColor:color}]} onPress={()=>{}}><Text style={s.categoryEmoji}>{emoji}</Text><Text style={s.categoryLabel}>{label}</Text></Pressable>)}</View>
      <View style={s.sectionHeader}><View><Text style={s.sectionTitle}>{ar ? "الرومات النشطة" : "Live rooms"}</Text><Text style={s.subtitle}>{ar ? "اختر مساحة تناسبك" : "Find your space"}</Text></View><Pressable onPress={() => void loadRooms()} style={s.secondary}><Text style={s.secondaryText}>{ar ? "تحديث ↻" : "Refresh ↻"}</Text></Pressable></View>
      {tab === "rooms" ? <View style={{flex:1}}><View style={s.actionsRow}><Pressable onPress={() => setShowCreateRoom((value) => !value)} style={s.primary}><Text style={s.primaryText}>{showCreateRoom ? (ar ? "إلغاء" : "Cancel") : (ar ? "+ إنشاء غرفة" : "+ Create room")}</Text></Pressable><Pressable onPress={() => void loadRooms()} style={s.secondary}><Text style={s.secondaryText}>{ar ? "تحديث" : "Refresh"}</Text></Pressable></View>{showCreateRoom ? <View style={s.createCard}><Text style={s.formLabel}>{ar ? "اسم الغرفة" : "Room name"}</Text><TextInput value={roomName} onChangeText={setRoomName} placeholder={ar ? "مثلاً: سهرات جيهو" : "e.g. JEHOO Hangout"} placeholderTextColor="#728295" maxLength={80} style={s.field} /><Text style={s.formLabel}>{ar ? "الوصف (اختياري)" : "Description (optional)"}</Text><TextInput value={roomDescription} onChangeText={setRoomDescription} placeholder={ar ? "عن ماذا سنتحدث؟" : "What is this room about?"} placeholderTextColor="#728295" maxLength={500} multiline style={[s.field,s.descriptionField]} /><Pressable disabled={createBusy} onPress={() => void createRoom()} style={s.primary}><Text style={s.primaryText}>{createBusy ? (ar ? "جاري الإنشاء..." : "Creating...") : (ar ? "إنشاء والدخول للغرفة" : "Create and enter room")}</Text></Pressable></View> : null}{loading ? <ActivityIndicator style={{marginTop:32}} color="#31D6B0"/> : error ? <View style={s.empty}><Text style={s.error}>{error}</Text></View> : <FlatList data={rooms} keyExtractor={(item) => item.id} contentContainerStyle={s.list} ListEmptyComponent={<View style={s.empty}><Text style={s.emptyTitle}>{ar ? "لا توجد غرف بعد" : "No rooms yet"}</Text></View>} renderItem={({item}) => <Pressable onPress={() => router.push({pathname:"/room/[id]",params:{id:item.id}})} style={s.room}><View style={[s.roomCover,{backgroundColor:item.is_featured?"#0C5848":"#153A35"}]}><Text style={s.roomEmoji}>{item.is_featured?"👑":"🎙️"}</Text><View style={s.liveBadge}><Text style={s.liveBadgeText}>{item.status==="active"?(ar?"مباشر":"LIVE"):(ar?"مفتوحة":"OPEN")}</Text></View></View><View style={s.roomInfo}><Text style={s.roomName}>{item.name}</Text><Text style={s.subtitle} numberOfLines={2}>{item.description || (ar ? "غرفة صوتية على جيهو" : "JEHOO voice room")}</Text><Text style={s.roomMeta}>● {ar?"انضم وشارك الحديث":"Join the conversation"}</Text></View><Text style={s.chevron}>‹</Text></Pressable>} />}</View> : tab === "chats" ? <View style={s.emptyTab}><View style={s.bigIcon}><Text style={s.bigIconText}>☷</Text></View><Text style={s.emptyTitle}>{ar ? "الدردشات" : "Chats"}</Text><Text style={s.subtitle}>{ar ? "محادثاتك الخاصة ومحادثات الأصدقاء ستظهر هنا." : "Your private and friends chats will appear here."}</Text></View> : <View style={s.mePage}><View style={s.profileCard}><View style={s.avatar}><Text style={s.avatarText}>{(profile?.nickname || profile?.first_name || "ج").slice(0,1).toUpperCase()}</Text></View><View style={{flex:1}}><Text style={s.meName}>{profile?.nickname || profile?.first_name || (ar ? "مستخدم جيهو" : "JEHOO User")}</Text><Text style={s.subtitle}>ID: {profile?.public_id ?? "—"}</Text></View><Text style={s.onlineDot}>●</Text></View><Pressable style={s.personalRoom} onPress={() => void openPersonalRoom()}><View style={s.personalIcon}><Text style={s.personalIconText}>♬</Text></View><View style={{flex:1}}><Text style={s.roomName}>{ar ? "رومي الشخصي" : "My personal room"}</Text><Text style={s.subtitle}>{ar ? "غرفتك الخاصة وصوتك ومتابعوك" : "Your room, voice and followers"}</Text></View><Text style={s.chevron}>‹</Text></Pressable>{[["◉",ar?"ملفي الشخصي":"My profile"],["✦",ar?"المتابعون":"Followers"],["▣",ar?"المتجر والأيديات":"Store & IDs"],["⚙",ar?"الإعدادات":"Settings"]].map(([icon,label]) => <Pressable key={label} style={s.menuRow}><Text style={s.menuIcon}>{icon}</Text><Text style={s.menuLabel}>{label}</Text><Text style={s.chevron}>‹</Text></Pressable>)}<Pressable onPress={signOut} style={s.signOut}><Text style={s.signOutText}>{copy.signOut}</Text></Pressable></View>}
      <View style={s.bottomNav}>{[["rooms","◉",ar?"الغرف":"Rooms"],["chats","☷",ar?"الدردشات":"Chats"],["me","●",ar?"أنا":"Me"]].map(([id,icon,label]) => <Pressable key={id} onPress={() => setTab(id as "rooms"|"chats"|"me")} style={s.navItem}><View style={[s.navIcon,{backgroundColor:tab===id?"#31D6B0":"#16222D"}]}><Text style={[s.navIconText,{color:tab===id?"#06251E":"#B6C4D0"}]}>{icon}</Text></View><Text style={[s.navLabel,{color:tab===id?"#31D6B0":"#94A3B8"}]}>{label}</Text></Pressable>)}</View>
    </>}
    {error && session && <Text style={s.error}>{error}</Text>}
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#F4F8F5",paddingHorizontal:14,paddingTop:12},topLinks:{paddingHorizontal:5,marginBottom:12,flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between"},quickIcons:{flexDirection:"row",gap:15,alignItems:"center"},quickIcon:{fontSize:27,color:"#173B32",fontWeight:"800"},categoryRow:{flexDirection:"row",gap:9,marginBottom:20},categoryCard:{flex:1,minHeight:112,borderRadius:22,borderWidth:1.5,alignItems:"center",justifyContent:"center",gap:7},categoryEmoji:{fontSize:34},categoryLabel:{fontSize:16,fontWeight:"900",color:"#173B32"},bannerGlow:{flex:1,justifyContent:"center",padding:17,borderRadius:20,backgroundColor:"#075342",borderWidth:1,borderColor:"#28C6A0"},bannerPill:{alignSelf:"flex-start",marginTop:12,paddingHorizontal:14,paddingVertical:7,borderRadius:18,backgroundColor:"#27D0A5"},bannerPillText:{color:"#07382D",fontWeight:"900"},
  header:{flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between",marginBottom:12},
  brand:{fontSize:22,fontWeight:"900",letterSpacing:0,color:"#173B32"},
  mint:{color:"#31D6B0",fontWeight:"700"},
  subtitle:{color:"#72877D",fontSize:12,marginTop:5},
  language:{borderColor:"#263342",borderWidth:1,borderRadius:20,paddingVertical:8,paddingHorizontal:12},
  languageText:{color:"#D9E3EA",fontSize:12},
  hero:{marginTop:50,backgroundColor:"#121B25",borderColor:"#263342",borderWidth:1,borderRadius:24,padding:24},
  eyebrow:{color:"#31D6B0",fontSize:13,marginBottom:18},
  heroTitle:{fontSize:27,fontWeight:"800",color:"#F2F7FA",marginBottom:12},
  body:{fontSize:14,lineHeight:24,color:"#B6C4D0",marginBottom:24},
  primary:{minHeight:48,borderRadius:12,backgroundColor:"#31D6B0",alignItems:"center",justifyContent:"center",paddingHorizontal:16},
  primaryText:{fontWeight:"800",color:"#06251E"},
  banner:{height:166,backgroundColor:"#07382F",borderWidth:1,borderColor:"#1E8E70",borderRadius:23,marginBottom:18,overflow:"hidden"},bannerIcon:{width:46,height:46,borderRadius:15,backgroundColor:"#31D6B0",alignItems:"center",justifyContent:"center"},bannerIconText:{fontSize:22,color:"#06251E"},bannerKicker:{fontSize:11,fontWeight:"900",letterSpacing:1,color:"#7BF4D1"},bannerTitle:{fontSize:27,fontWeight:"900",color:"#FFF3B0",marginTop:5},bannerText:{fontSize:12,color:"#E2FFF5",marginTop:5},sectionHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:18},
  actionsRow:{flexDirection:"row",alignItems:"center",gap:10,marginBottom:16},
  createCard:{backgroundColor:"#121B25",borderWidth:1,borderColor:"#263342",borderRadius:18,padding:16,gap:10,marginBottom:16},
  formLabel:{color:"#D9E3EA",fontSize:13,fontWeight:"700",textAlign:"right"},
  field:{backgroundColor:"#0A1118",borderWidth:1,borderColor:"#263342",borderRadius:10,color:"#F2F7FA",paddingHorizontal:12,paddingVertical:12,textAlign:"right",minHeight:46},
  descriptionField:{minHeight:84,textAlignVertical:"top"},
  sectionTitle:{fontSize:21,fontWeight:"900",color:"#173B32"},
  secondary:{borderColor:"#CDE4D9",borderWidth:1,borderRadius:14,paddingVertical:9,paddingHorizontal:12,backgroundColor:"#FFFFFF"},
  secondaryText:{color:"#1D6954",fontSize:12,fontWeight:"800"},
  list:{paddingBottom:30,gap:12},
  room:{flexDirection:"row-reverse",alignItems:"center",gap:11,padding:10,borderRadius:18,borderWidth:1,borderColor:"#DCEAE3",backgroundColor:"#FFFFFF",marginBottom:2,shadowColor:"#173B32",shadowOpacity:0.05,shadowRadius:8,elevation:1},
  roomIcon:{width:48,height:48,borderRadius:14,backgroundColor:"#18352F",alignItems:"center",justifyContent:"center"},roomCover:{width:78,height:82,borderRadius:14,alignItems:"center",justifyContent:"center",position:"relative"},liveBadge:{position:"absolute",bottom:5,left:5,right:5,backgroundColor:"#24C99D",borderRadius:8,paddingVertical:2,alignItems:"center"},liveBadgeText:{fontSize:9,fontWeight:"900",color:"#07382D"},roomMeta:{fontSize:10,color:"#20A783",marginTop:5,fontWeight:"700"},
  roomEmoji:{fontSize:24},
  roomInfo:{flex:1},
  roomName:{fontSize:15,fontWeight:"900",color:"#18382F",marginBottom:4},
  status:{borderWidth:1,borderRadius:16,paddingVertical:5,paddingHorizontal:8},
  empty:{alignItems:"center",justifyContent:"center",padding:32,gap:10},
  emptyTitle:{color:"#F2F7FA",fontWeight:"700",fontSize:17},
  error:{color:"#FDA4AF",fontSize:13,marginTop:12},bottomNav:{position:"absolute",left:14,right:14,bottom:10,height:76,borderRadius:22,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E1ECE6",flexDirection:"row",alignItems:"center",justifyContent:"space-around",elevation:8,shadowColor:"#173B32",shadowOpacity:0.08,shadowRadius:10},navItem:{alignItems:"center",justifyContent:"center",minWidth:70},navIcon:{width:38,height:30,borderRadius:12,alignItems:"center",justifyContent:"center"},navIconText:{fontSize:16,fontWeight:"800"},navLabel:{fontSize:11,fontWeight:"800",marginTop:3},emptyTab:{flex:1,alignItems:"center",justifyContent:"center",paddingBottom:100},bigIcon:{width:76,height:76,borderRadius:26,backgroundColor:"#16222D",alignItems:"center",justifyContent:"center",marginBottom:16},bigIconText:{fontSize:32,color:"#31D6B0"},mePage:{flex:1,paddingBottom:100},profileCard:{flexDirection:"row",alignItems:"center",gap:12,backgroundColor:"#121B25",borderWidth:1,borderColor:"#263342",borderRadius:20,padding:16,marginBottom:14},avatar:{width:54,height:54,borderRadius:18,backgroundColor:"#31D6B0",alignItems:"center",justifyContent:"center"},avatarText:{fontSize:24,fontWeight:"900",color:"#06251E"},meName:{fontSize:17,fontWeight:"800",color:"#F2F7FA"},onlineDot:{color:"#31D6B0"},personalRoom:{flexDirection:"row",alignItems:"center",gap:12,backgroundColor:"#102821",borderWidth:1,borderColor:"#1E5B4E",borderRadius:18,padding:15,marginBottom:10},personalIcon:{width:48,height:48,borderRadius:15,backgroundColor:"#31D6B0",alignItems:"center",justifyContent:"center"},personalIconText:{fontSize:23,color:"#06251E"},chevron:{fontSize:25,color:"#31D6B0"},menuRow:{flexDirection:"row",alignItems:"center",gap:12,padding:16,borderBottomWidth:1,borderBottomColor:"#1A2732"},menuIcon:{fontSize:19,color:"#31D6B0",width:28,textAlign:"center"},menuLabel:{flex:1,color:"#D9E3EA",fontSize:14,fontWeight:"700"},signOut:{marginTop:18,borderWidth:1,borderColor:"#4A2930",borderRadius:12,padding:13,alignItems:"center"},signOutText:{color:"#FDA4AF"}
});
