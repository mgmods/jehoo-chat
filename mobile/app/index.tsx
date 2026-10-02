import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { messages, type Locale } from "../../packages/shared/src/index";

WebBrowser.maybeCompleteAuthSession();

type Room = { id: string; name: string; description: string; status: "active" | "locked" | "closed"; is_featured: boolean; created_at: string };

export default function HomeScreen() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ar");
  const [session, setSession] = useState<Session | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const copy = messages[locale];
  const ar = locale === "ar";

  useEffect(() => {
    const client = supabase;
    if (!client) { setLoading(false); setError(copy.configurationRequired); return; }
    let active = true;
    client.auth.getSession().then(({ data, error: authError }) => {
      if (!active) return;
      if (authError) setError(authError.message);
      setSession(data.session);
    }).catch((authError: unknown) => {
      if (active) setError(authError instanceof Error ? authError.message : "Authentication initialization failed.");
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
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

  async function signOut() {
    const client = supabase;
    if (!client) return;
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) setError(signOutError.message);
  }

  return <SafeAreaView style={s.safe}>
    <View style={s.header}>
      <View><Text style={s.brand}>JEHOO <Text style={s.mint}>●</Text> CHAT</Text><Text style={s.subtitle}>{copy.dashboardSubtitle}</Text></View>
      <Pressable style={s.language} onPress={() => setLocale(ar ? "en" : "ar")}><Text style={s.languageText}>{ar ? "English" : "العربية"}</Text></Pressable>
    </View>
    {!session ? <View style={s.hero}>
      <Text style={s.eyebrow}>{ar ? "مساحتك، صوتك، أصدقاؤك" : "Your space, your voice, your friends"}</Text>
      <Text style={s.heroTitle}>{ar ? "أهلاً بك في جيهو" : "Welcome to JEHOO"}</Text>
      <Text style={s.body}>{ar ? "سجّل الدخول لعرض الغرف الحقيقية المرتبطة بحسابك." : "Sign in to discover live rooms connected to your account."}</Text>
      <Pressable disabled={authBusy} onPress={signIn} style={s.primary}>{authBusy ? <ActivityIndicator color="#06251E" /> : <Text style={s.primaryText}>{ar ? "المتابعة باستخدام Google" : "Continue with Google"}</Text>}</Pressable>
    </View> : <>
      <View style={s.sectionHeader}><View><Text style={s.sectionTitle}>{ar ? "الغرف الصوتية" : "Voice rooms"}</Text><Text style={s.subtitle}>{ar ? "بيانات مباشرة من قاعدة البيانات" : "Live data from your database"}</Text></View><Pressable onPress={signOut} style={s.secondary}><Text style={s.secondaryText}>{copy.signOut}</Text></Pressable></View>
      <View style={s.actionsRow}>
        <Pressable onPress={() => setShowCreateRoom((value) => !value)} style={s.primary}><Text style={s.primaryText}>{showCreateRoom ? (ar ? "إلغاء" : "Cancel") : (ar ? "+ إنشاء غرفة" : "+ Create room")}</Text></Pressable>
        <Pressable onPress={() => void loadRooms()} style={s.secondary}><Text style={s.secondaryText}>{ar ? "تحديث" : "Refresh"}</Text></Pressable>
      </View>
      {showCreateRoom ? <View style={s.createCard}>
        <Text style={s.formLabel}>{ar ? "اسم الغرفة" : "Room name"}</Text>
        <TextInput value={roomName} onChangeText={setRoomName} placeholder={ar ? "مثلاً: سهرات جيهو" : "e.g. JEHOO Hangout"} placeholderTextColor="#728295" maxLength={80} style={s.field} returnKeyType="next" />
        <Text style={s.formLabel}>{ar ? "الوصف (اختياري)" : "Description (optional)"}</Text>
        <TextInput value={roomDescription} onChangeText={setRoomDescription} placeholder={ar ? "عن ماذا سنتحدث؟" : "What is this room about?"} placeholderTextColor="#728295" maxLength={500} multiline style={[s.field,s.descriptionField]} />
        <Pressable disabled={createBusy} onPress={() => void createRoom()} style={[s.primary,{opacity:createBusy?0.7:1}]}>{createBusy ? <ActivityIndicator color="#06251E" /> : <Text style={s.primaryText}>{ar ? "إنشاء والدخول للغرفة" : "Create and enter room"}</Text>}</Pressable>
      </View> : null}
      {loading ? <ActivityIndicator style={{ marginTop: 32 }} color="#31D6B0" /> : error ? <View style={s.empty}><Text style={s.error}>{error}</Text><Pressable onPress={() => void loadRooms()}><Text style={s.mint}>{ar ? "إعادة المحاولة" : "Retry"}</Text></Pressable></View> :
      <FlatList data={rooms} keyExtractor={(item) => item.id} contentContainerStyle={s.list} ListEmptyComponent={<View style={s.empty}><Text style={s.emptyTitle}>{ar ? "لا توجد غرف بعد" : "No rooms yet"}</Text><Text style={s.subtitle}>{ar ? "عندما تُنشأ غرف في الخادم ستظهر هنا." : "Rooms created on the backend will appear here."}</Text></View>}
        renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/room/[id]", params: { id: item.id } })} style={s.room}><View style={s.roomIcon}><Text style={s.roomEmoji}>🎙</Text></View><View style={s.roomInfo}><Text style={s.roomName}>{item.name}</Text><Text style={s.subtitle} numberOfLines={2}>{item.description || (ar ? "غرفة صوتية على جيهو" : "JEHOO voice room")}</Text></View><View style={[s.status,{borderColor:item.status==="active"?"#31D6B0":"#E8B86D"}]}><Text style={{color:item.status==="active"?"#31D6B0":"#E8B86D",fontSize:11}}>{item.status==="active"?(ar?"نشطة":"Active"):(ar?"مقفلة":"Locked")}</Text></View></Pressable>} />}
    </>}
    {error && session && <Text style={s.error}>{error}</Text>}
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#0A1118",paddingHorizontal:20,paddingTop:18},
  header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:30},
  brand:{fontSize:22,fontWeight:"800",letterSpacing:1,color:"#F2F7FA"},
  mint:{color:"#31D6B0",fontWeight:"700"},
  subtitle:{color:"#94A3B8",fontSize:12,marginTop:5},
  language:{borderColor:"#263342",borderWidth:1,borderRadius:20,paddingVertical:8,paddingHorizontal:12},
  languageText:{color:"#D9E3EA",fontSize:12},
  hero:{marginTop:50,backgroundColor:"#121B25",borderColor:"#263342",borderWidth:1,borderRadius:24,padding:24},
  eyebrow:{color:"#31D6B0",fontSize:13,marginBottom:18},
  heroTitle:{fontSize:27,fontWeight:"800",color:"#F2F7FA",marginBottom:12},
  body:{fontSize:14,lineHeight:24,color:"#B6C4D0",marginBottom:24},
  primary:{minHeight:48,borderRadius:12,backgroundColor:"#31D6B0",alignItems:"center",justifyContent:"center",paddingHorizontal:16},
  primaryText:{fontWeight:"800",color:"#06251E"},
  sectionHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:18},
  actionsRow:{flexDirection:"row",alignItems:"center",gap:10,marginBottom:16},
  createCard:{backgroundColor:"#121B25",borderWidth:1,borderColor:"#263342",borderRadius:18,padding:16,gap:10,marginBottom:16},
  formLabel:{color:"#D9E3EA",fontSize:13,fontWeight:"700",textAlign:"right"},
  field:{backgroundColor:"#0A1118",borderWidth:1,borderColor:"#263342",borderRadius:10,color:"#F2F7FA",paddingHorizontal:12,paddingVertical:12,textAlign:"right",minHeight:46},
  descriptionField:{minHeight:84,textAlignVertical:"top"},
  sectionTitle:{fontSize:22,fontWeight:"800",color:"#F2F7FA"},
  secondary:{borderColor:"#263342",borderWidth:1,borderRadius:10,paddingVertical:9,paddingHorizontal:12},
  secondaryText:{color:"#D9E3EA",fontSize:12},
  list:{paddingBottom:30,gap:12},
  room:{flexDirection:"row",alignItems:"center",gap:12,padding:14,borderRadius:16,borderWidth:1,borderColor:"#263342",backgroundColor:"#121B25"},
  roomIcon:{width:48,height:48,borderRadius:14,backgroundColor:"#18352F",alignItems:"center",justifyContent:"center"},
  roomEmoji:{fontSize:24},
  roomInfo:{flex:1},
  roomName:{fontSize:15,fontWeight:"700",color:"#F2F7FA",marginBottom:4},
  status:{borderWidth:1,borderRadius:16,paddingVertical:5,paddingHorizontal:8},
  empty:{alignItems:"center",justifyContent:"center",padding:32,gap:10},
  emptyTitle:{color:"#F2F7FA",fontWeight:"700",fontSize:17},
  error:{color:"#FDA4AF",fontSize:13,marginTop:12}
});
