import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View, ScrollView, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { messages, type Locale } from "../../packages/shared/src/index";
import ProfileOnboarding from "@/components/ProfileOnboarding";

WebBrowser.maybeCompleteAuthSession();

type Room = { id: string; owner_id:string; name: string; description: string; cover_url:string|null; status: "active" | "locked" | "closed"; is_featured: boolean; max_seats:number; password_enabled:boolean; created_at: string; owner?:{display_name:string;avatar_url:string}|null };

export default function HomeScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = Math.max(0, screenWidth - 40);
  const cardWidth = Math.max(0, (contentWidth - 21) / 2);
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
  const [roomFilter, setRoomFilter] = useState<"popular" | "egypt" | "syria">("syria");
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
      .select("id,owner_id,name,description,cover_url,status,is_featured,max_seats,password_enabled,created_at,owner:profiles!rooms_owner_id_fkey(display_name,avatar_url)")
      .neq("status", "closed").order("is_featured", { ascending: false }).order("created_at", { ascending: false }).limit(30);
    if (queryError) setError(queryError.message);
    else setRooms((data ?? []).map((room) => ({ ...room, owner: Array.isArray(room.owner) ? (room.owner[0] ?? null) : (room.owner ?? null) })) as Room[]);
    setLoading(false);
  }, [session]);

  useEffect(() => { void loadRooms(); }, [loadRooms]);
  useEffect(() => { const client=supabase; if(!client||!session)return; const channel=client.channel("home-rooms").on("postgres_changes",{event:"*",schema:"public",table:"rooms"},()=>void loadRooms()).subscribe(); return()=>{void client.removeChannel(channel)}; },[session,loadRooms]);

  async function signIn() {
    const client = supabase;
    if (!client) { setError(copy.configurationRequired); return; }
    setError("");
    setAuthBusy(true);
    try {
      const redirectTo = "jehoochat://auth/callback";
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
    setProfileLoading(true);
    try {
      const { data, error: profileError } = await supabase.from("profiles")
        .select("id,public_id,first_name,nickname,gender,birth_date,country,avatar_url,profile_completed")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      setProfile(data);
      setTab("rooms");
      setShowCreateRoom(false);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحديث الملف الشخصي.");
    } finally {
      setProfileLoading(false);
    }
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

  if (!profileLoading && session && !profile?.profile_completed) {
    return <ProfileOnboarding
      user={session.user}
      initialProfile={profile}
      onComplete={() => void refreshProfile()}
      onToggleLanguage={() => setLocale(locale === "ar" ? "en" : "ar")}
    />;
  }

  return <SafeAreaView edges={["top","left","right","bottom"]} style={s.safe}>
    {tab === "rooms" ? <View style={s.header}>
      <View style={s.quickIcons}>
        <Pressable accessibilityRole="button" onPress={() => setTab("rooms")} style={s.quickButton}><Text style={s.quickIcon}>⌂</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => void loadRooms()} style={s.quickButton}><Text style={s.quickIcon}>⌕</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setShowCreateRoom(true)} style={s.quickButton}><Text style={s.quickIcon}>🎉</Text></Pressable>
      </View>
      <View style={s.topLinkGroup}>
        <Pressable onPress={() => { setTab("rooms"); void loadRooms(); }}><Text style={s.topLinkActive}>{ar ? "حفلة" : "Party"}</Text></Pressable>
        <Pressable onPress={() => { setTab("rooms"); void loadRooms(); }}><Text style={s.topLink}>{ar ? "ملكي" : "Mine"}</Text></Pressable>
        <Pressable onPress={() => { setTab("rooms"); void loadRooms(); }}><Text style={s.topLink}>{ar ? "الفعاليات" : "Events"}</Text></Pressable>
      </View>
    </View> : null}
    <ScrollView style={s.contentScroll} contentContainerStyle={s.contentContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {!session ? <View style={s.hero}>
        <Text style={s.eyebrow}>{ar ? "مساحتك، صوتك، أصدقاؤك" : "Your space, your voice, your friends"}</Text>
        <Text style={s.heroTitle}>{ar ? "أهلاً بك في جيهو" : "Welcome to JEHOO"}</Text>
        <Text style={s.body}>{ar ? "سجّل الدخول لعرض الغرف الحقيقية المرتبطة بحسابك." : "Sign in to discover live rooms connected to your account."}</Text>
        <Pressable disabled={authBusy} onPress={signIn} style={s.primary}>{authBusy ? <ActivityIndicator color="#06251E" /> : <Text style={s.primaryText}>{ar ? "المتابعة باستخدام Google" : "Continue with Google"}</Text>}</Pressable>
      </View> : tab === "rooms" ? <View>
        <Pressable onPress={() => { setTab("rooms"); void loadRooms(); }} style={s.banner}>
          <View style={s.bannerGlow}><View style={s.bannerArt}><Text style={s.bannerGift}>🎁</Text><Text style={s.bannerDiamond}>◆</Text><Text style={s.bannerPerson}>👩🏻</Text><Text style={s.bannerPerson2}>🧑🏻</Text></View><Text style={s.bannerKicker}>JEHOO ✦ LIVE</Text><Text style={s.bannerTitle}>{ar ? "مكافآت الشحن" : "Recharge Rewards"}</Text><Text style={s.bannerText}>{ar ? "ادخل غرفتك المفضلة وتعرّف على أصدقاء جدد" : "Join your favorite rooms and meet new friends"}</Text><View style={s.bannerPill}><Text style={s.bannerPillText}>{ar ? "اكتشف الآن  ←" : "Explore now  →"}</Text></View></View>
        </Pressable>
        <View style={s.categoryRow}>{[
          { label: ar ? "قربي" : "Nearby", color: "#3997E8", count: 3, icon: "👑" },
          { label: "CP", color: "#A44CF0", count: 2, icon: "💎" },
          { label: ar ? "الثروة" : "Rich", color: "#F3B54A", count: 3, icon: "🏆" },
        ].map(item => <Pressable key={item.label} style={[s.categoryCard,{backgroundColor:item.color+"22",borderColor:item.color}]} onPress={() => { setTab("rooms"); void loadRooms(); }}>
          <View style={s.categoryPeople}>{Array.from({length:item.count}).map((_,i)=><View key={i} style={s.categoryAvatar}><Text style={s.categoryCrown}>{item.icon}</Text><Text style={s.categoryPerson}>👤</Text></View>)}</View>
          <Text style={s.categoryLabel}>{item.label}</Text>
        </Pressable>)}</View>
        <View style={s.filterRow}>
          <Pressable onPress={() => { setRoomFilter("popular"); void loadRooms(); }} style={[s.filterPill,roomFilter==="popular"&&s.filterPillActive]}><Text style={[s.filterText,s.filterTextActive]}>🔥 {ar ? "شائع" : "Popular"}</Text></Pressable>
          <Pressable onPress={() => { setRoomFilter("egypt"); void loadRooms(); }} style={[s.filterPill,roomFilter==="egypt"&&s.filterPillActive]}><Text style={[s.filterText,roomFilter==="egypt"&&s.filterTextActive]}>🇪🇬 مصر</Text></Pressable>
          <Pressable onPress={() => { setRoomFilter("syria"); void loadRooms(); }} style={[s.filterPill,roomFilter==="syria"&&s.filterPillActive]}><Text style={[s.filterText,roomFilter==="syria"&&s.filterTextCountryActive]}>🇸🇾 سوريا</Text></Pressable>
          <Pressable onPress={() => setRoomFilter(roomFilter==="popular"?"egypt":roomFilter==="egypt"?"syria":"popular")} style={s.dropdown}><Text style={s.filterText}>⌄</Text></Pressable>
        </View>
        <View style={s.sectionHeader}><View><Text style={s.sectionTitle}>{ar ? "الرومات النشطة" : "Live rooms"}</Text><Text style={s.subtitle}>{ar ? "اختر مساحة تناسبك" : "Find your space"}</Text></View><Pressable onPress={() => void loadRooms()} style={s.secondary}><Text style={s.secondaryText}>{ar ? "تحديث ↻" : "Refresh ↻"}</Text></Pressable></View>
        <View style={s.actionsRow}>
          <Pressable onPress={() => setShowCreateRoom(v => !v)} style={[s.primary,{flex:1}]}><Text style={s.primaryText}>{showCreateRoom ? (ar ? "إلغاء" : "Cancel") : (ar ? "+ إنشاء غرفة" : "+ Create room")}</Text></Pressable>
          <Pressable onPress={() => void loadRooms()} style={s.secondary}><Text style={s.secondaryText}>{ar ? "تحديث" : "Refresh"}</Text></Pressable>
        </View>
        {showCreateRoom ? <View style={s.createCard}>
          <Text style={s.formLabel}>{ar ? "اسم الغرفة" : "Room name"}</Text><TextInput value={roomName} onChangeText={setRoomName} placeholder={ar ? "مثلاً: سهرات جيهو" : "e.g. JEHOO Hangout"} placeholderTextColor="#728295" maxLength={80} style={s.field} />
          <Text style={s.formLabel}>{ar ? "الوصف (اختياري)" : "Description (optional)"}</Text><TextInput value={roomDescription} onChangeText={setRoomDescription} placeholder={ar ? "عن ماذا سنتحدث؟" : "What is this room about?"} placeholderTextColor="#728295" maxLength={500} multiline style={[s.field,s.descriptionField]} />
          <Pressable disabled={createBusy} onPress={() => void createRoom()} style={s.primary}><Text style={s.primaryText}>{createBusy ? (ar ? "جاري الإنشاء..." : "Creating...") : (ar ? "إنشاء والدخول للغرفة" : "Create and enter room")}</Text></Pressable>
        </View> : null}
        {loading ? <ActivityIndicator style={{marginTop:32}} color="#31D6B0"/> : error ? <View style={s.empty}><Text style={s.error}>{error}</Text></View> : rooms.length === 0 ? <View style={s.empty}><Text style={s.emptyTitle}>{ar ? "لا توجد غرف بعد" : "No rooms yet"}</Text></View> : <View style={s.roomGrid}>{rooms.map((item,index) => <Pressable key={item.id} onPress={() => router.push({pathname:"/room/[id]",params:{id:item.id}})} style={[s.room,{width:cardWidth}]}><View style={s.roomCover}>{(item as any).cover_url?<Image source={{uri:(item as any).cover_url}} style={s.roomCoverImage}/>:<Text style={s.roomEmoji}>{item.is_featured?"👑":"🎙️"}</Text>}<View style={s.roomCoverShade}/><View style={s.roomCoverTop}><Text style={s.roomCoverHint}>{(item as any).password_enabled?"🔒 ":""}{(item as any).max_seats||10} مقعد</Text><View style={s.liveBadge}><Text style={s.liveBadgeText}>{item.status==="active"?"مباشر":"متاح"}</Text></View></View></View><View style={s.roomInfo}><Text style={s.roomName} numberOfLines={1}>{item.name}</Text><Text style={s.subtitle} numberOfLines={2}>{item.description || (ar ? "غرفة صوتية على جيهو" : "JEHOO voice room")}</Text><View style={s.roomBottom}><Text style={s.roomMeta}>● {item.max_seats} {ar?"مقاعد":"seats"}{item.password_enabled?"  🔒":""}</Text><Text style={s.chevron}>‹</Text></View></View></Pressable>)}</View>}
      </View> : tab === "chats" ? <View style={s.chatPage}>
        <Text style={s.pageTitle}>{ar ? "الدردشات" : "Chats"}</Text>
        <Text style={s.subtitle}>{ar ? "محادثاتك فقط، بدون إضافات الشاشة الرئيسية." : "Your chats only."}</Text>
        <Pressable style={s.personalRoom} onPress={() => router.push("/official-messages")}><View style={s.personalIcon}><Text style={s.personalIconText}>✓</Text></View><View style={{flex:1}}><Text style={s.roomName}>الرسائل الرسمية ✅</Text><Text style={s.subtitle}>إعلانات وإشعارات الإدارة — مثبتة بالأعلى</Text></View><Text style={s.chevron}>‹</Text></Pressable>
      </View> : <View style={s.mePage}>
        <Text style={s.pageTitle}>{ar ? "أنا" : "Me"}</Text>
        <View style={s.profileCard}><View style={s.avatar}><Text style={s.avatarText}>{(profile?.nickname || profile?.first_name || "ج").slice(0,1).toUpperCase()}</Text></View><View style={{flex:1}}><Text style={s.meName}>{profile?.nickname || profile?.first_name || (ar ? "مستخدم جيهو" : "JEHOO User")}</Text><Text style={s.subtitle}>ID: {profile?.public_id ?? "—"}</Text></View><Text style={s.onlineDot}>●</Text></View>
        <Pressable style={s.personalRoom} onPress={() => void openPersonalRoom()}><View style={s.personalIcon}><Text style={s.personalIconText}>♬</Text></View><View style={{flex:1}}><Text style={s.roomName}>{ar ? "رومي الشخصي" : "My personal room"}</Text><Text style={s.subtitle}>{ar ? "غرفتك الخاصة وصوتك ومتابعوك" : "Your room, voice and followers"}</Text></View><Text style={s.chevron}>‹</Text></Pressable>
        {[["◉",ar?"ملفي الشخصي":"My profile"],["✦",ar?"المتابعون":"Followers"],["▣",ar?"المتجر والأيديات":"Store & IDs"],["⚙",ar?"الإعدادات":"Settings"]].map(([icon,label]) => <Pressable key={label} onPress={() => label === (ar?"ملفي الشخصي":"My profile") ? router.push("/edit-profile") : Alert.alert(label, ar ? "هذا القسم سيُفتح عند تفعيل خدمته." : "This section will open when its service is enabled.")} style={s.menuRow}><Text style={s.menuIcon}>{icon}</Text><Text style={s.menuLabel}>{label}</Text><Text style={s.chevron}>‹</Text></Pressable>)}
        <Pressable onPress={signOut} style={s.signOut}><Text style={s.signOutText}>{copy.signOut}</Text></Pressable>
      </View>}
      {error && session && tab !== "rooms" ? <Text style={s.error}>{error}</Text> : null}
    </ScrollView>
    {session ? <View style={s.bottomNav}>{[["rooms","◉",ar?"الغرف":"Rooms"],["chats","☷",ar?"الدردشات":"Chats"],["me","●",ar?"أنا":"Me"]].map(([id,icon,label]) => <Pressable key={id} onPress={() => setTab(id as "rooms"|"chats"|"me")} style={s.navItem}><View style={[s.navIcon,{backgroundColor:tab===id?"#31D6B0":"#16222D"}]}><Text style={[s.navIconText,{color:tab===id?"#06251E":"#B6C4D0"}]}>{icon}</Text></View><Text style={[s.navLabel,{color:tab===id?"#31D6B0":"#94A3B8"}]}>{label}</Text></Pressable>)}</View> : null}
  </SafeAreaView>;

}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#F7F8F6"},
  contentScroll:{flex:1},
  contentContainer:{paddingHorizontal:0,paddingTop:0,paddingBottom:128},
  header:{height:69,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20,backgroundColor:"#F7F8F6"},
  topLinks:{flex:1,flexDirection:"row-reverse",alignItems:"center",justifyContent:"flex-start",gap:26},
  topLinkGroup:{flexDirection:"row-reverse",alignItems:"center",gap:24},
  topLink:{color:"#4E5A55",fontSize:16,fontWeight:"800"},
  topLinkActive:{color:"#1B9C72",fontSize:16,fontWeight:"900"},
  brand:{fontSize:18,fontWeight:"900",color:"#26332E"},mint:{color:"#19C995",fontWeight:"900"},
  quickIcons:{flexDirection:"row",alignItems:"center",gap:9},
  quickButton:{width:34,height:34,borderRadius:11,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E1E5E2",alignItems:"center",justifyContent:"center"},
  quickIcon:{fontSize:18,color:"#26332E",fontWeight:"800"},
  language:{borderColor:"#DDE3DF",borderWidth:1,borderRadius:16,paddingVertical:6,paddingHorizontal:10},
  languageText:{color:"#315248",fontSize:11,fontWeight:"800"},
  banner:{marginHorizontal:20,height:208,borderRadius:22,marginBottom:18,overflow:"hidden",backgroundColor:"#D98C38"},
  bannerGlow:{flex:1,justifyContent:"center",paddingHorizontal:24,paddingVertical:20,backgroundColor:"#D58A35",position:"relative"},
  bannerArt:{position:"absolute",left:18,top:24,width:170,height:150},bannerGift:{position:"absolute",left:2,top:34,fontSize:46},bannerDiamond:{position:"absolute",left:52,top:12,fontSize:34,color:"#5DE3C0",transform:[{rotate:"45deg"}]},bannerPerson:{position:"absolute",right:18,top:24,fontSize:58},bannerPerson2:{position:"absolute",right:62,top:58,fontSize:52},
  bannerKicker:{fontSize:11,fontWeight:"900",letterSpacing:1,color:"#FFF4D1"},
  bannerTitle:{fontSize:28,fontWeight:"900",color:"#FFF8DD",marginTop:6,textAlign:"right"},
  bannerText:{fontSize:13,color:"#FFF7E8",marginTop:7,textAlign:"right",maxWidth:"72%"},
  bannerPill:{alignSelf:"flex-start",marginTop:13,paddingHorizontal:15,paddingVertical:7,borderRadius:18,backgroundColor:"#20C69A"},
  bannerPillText:{color:"#07382D",fontSize:12,fontWeight:"900"},
  categoryRow:{flexDirection:"row",gap:11,marginHorizontal:20,marginBottom:14},
  categoryCard:{flex:1,height:170,borderRadius:22,alignItems:"center",justifyContent:"center",overflow:"hidden",borderWidth:1},
  categoryEmoji:{fontSize:29},
  categoryLabel:{fontSize:21,fontWeight:"900",color:"#FFFFFF",marginTop:9},
  categoryPeople:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:5},
  categoryAvatar:{width:45,height:45,borderRadius:23,backgroundColor:"#FFFFFFAA",borderWidth:2,borderColor:"#FFFFFF",alignItems:"center",justifyContent:"center"},
  categoryCrown:{position:"absolute",top:-11,fontSize:16},categoryPerson:{fontSize:20},
  filterRow:{flexDirection:"row-reverse",alignItems:"center",gap:8,marginHorizontal:20,marginBottom:16},
  filterPill:{height:52,borderRadius:26,paddingHorizontal:17,alignItems:"center",justifyContent:"center",backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E1E6E3"},
  filterPillActive:{backgroundColor:"#19C995",borderColor:"#19C995"},filterPillCountryActive:{height:56,borderRadius:28,borderWidth:2,borderColor:"#19C995",backgroundColor:"#FFFFFF",paddingHorizontal:19},
  filterText:{fontSize:14,fontWeight:"900",color:"#4B5953"},
  filterTextActive:{color:"#FFFFFF"},filterTextCountryActive:{color:"#1D6954"},
  dropdown:{height:52,width:52,borderRadius:26,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E1E6E3",alignItems:"center",justifyContent:"center"},
  roomGrid:{flexDirection:"row",flexWrap:"wrap",columnGap:21,rowGap:17,marginHorizontal:20},
  room:{width:"48%",minWidth:0,height:405,overflow:"hidden",borderRadius:25,borderWidth:1,borderColor:"#E2E6E3",backgroundColor:"#FFFFFF",shadowColor:"#17251F",shadowOpacity:0.08,shadowRadius:10,elevation:2},
  roomCover:{height:"74%",width:"100%",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",backgroundColor:"#D9E8E2"},roomCoverShade:{position:"absolute",left:0,right:0,top:0,bottom:0,backgroundColor:"rgba(0,0,0,0.08)"},roomCoverTop:{position:"absolute",left:12,right:12,top:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},roomCoverImage:{width:"100%",height:"100%"},roomArt:{width:"100%",height:"100%",alignItems:"center",justifyContent:"center"},ownerMini:{position:"absolute",left:10,bottom:10,right:10,flexDirection:"row",alignItems:"center",gap:6,backgroundColor:"rgba(0,0,0,0.35)",borderRadius:14,paddingHorizontal:7,paddingVertical:5},ownerAvatar:{width:24,height:24,borderRadius:12},ownerAvatarFallback:{width:24,height:24,borderRadius:12,backgroundColor:"#31D6B0",alignItems:"center",justifyContent:"center"},ownerAvatarText:{fontSize:11,fontWeight:"900",color:"#06251E"},ownerName:{flex:1,color:"#FFFFFF",fontSize:10,fontWeight:"800"},
  roomEmoji:{fontSize:42},
  roomCoverHint:{fontSize:11,color:"#FFFFFF",fontWeight:"900",marginTop:7},
  liveBadge:{position:"absolute",top:13,right:13,bottom:undefined,left:undefined,backgroundColor:"#FFFFFFDD",borderRadius:10,paddingHorizontal:8,paddingVertical:4},
  liveBadgeText:{fontSize:9,fontWeight:"900",color:"#173B32"},
  roomInfo:{position:"absolute",left:0,right:0,bottom:0,paddingHorizontal:15,paddingTop:45,paddingBottom:14,backgroundColor:"rgba(0,0,0,0.42)"},
  roomName:{fontSize:16,fontWeight:"900",color:"#FFFFFF",marginBottom:5,textAlign:"right"},
  subtitle:{color:"#EAF0ED",fontSize:11,marginTop:3},
  roomBottom:{flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between",marginTop:5},
  roomMeta:{fontSize:10,color:"#DDFBF0",fontWeight:"700"},
  chevron:{fontSize:24,color:"#FFFFFF"},
  sectionHeader:{marginHorizontal:20,marginBottom:10},
  sectionTitle:{fontSize:18,fontWeight:"900",color:"#26352F",textAlign:"right"},
  actionsRow:{flexDirection:"row",alignItems:"center",gap:10,marginHorizontal:20,marginBottom:14},
  primary:{minHeight:48,borderRadius:24,backgroundColor:"#19C995",alignItems:"center",justifyContent:"center",paddingHorizontal:16},
  primaryText:{fontWeight:"900",fontSize:14,color:"#FFFFFF"},
  secondary:{borderColor:"#D5E1DC",borderWidth:1,borderRadius:18,paddingVertical:9,paddingHorizontal:12,backgroundColor:"#FFFFFF"},
  secondaryText:{color:"#1D6954",fontSize:12,fontWeight:"800"},
  createCard:{marginHorizontal:20,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E0E6E2",borderRadius:20,padding:16,gap:10,marginBottom:16},
  formLabel:{color:"#34433D",fontSize:13,fontWeight:"800",textAlign:"right"},
  field:{backgroundColor:"#F8FAF9",borderWidth:1,borderColor:"#DCE4DF",borderRadius:12,color:"#20312A",paddingHorizontal:12,paddingVertical:12,textAlign:"right",minHeight:46},
  descriptionField:{minHeight:84,textAlignVertical:"top"},
  empty:{alignItems:"center",justifyContent:"center",padding:32,gap:10},
  emptyTitle:{color:"#45544E",fontWeight:"800",fontSize:17},
  error:{color:"#C94A4A",fontSize:13,marginTop:12,textAlign:"center"},
  bottomNav:{position:"absolute",left:14,right:14,bottom:7,height:70,borderRadius:22,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E1E7E3",flexDirection:"row",alignItems:"center",justifyContent:"space-around",elevation:8,shadowColor:"#173B32",shadowOpacity:0.08,shadowRadius:10},
  navItem:{alignItems:"center",justifyContent:"center",minWidth:70},navIcon:{width:36,height:30,borderRadius:12,alignItems:"center",justifyContent:"center"},navIconText:{fontSize:16,fontWeight:"800"},navLabel:{fontSize:11,fontWeight:"800",marginTop:3},
  chatPage:{paddingHorizontal:20,paddingTop:18,paddingBottom:100},pageTitle:{fontSize:23,fontWeight:"900",color:"#26352F",textAlign:"right",marginBottom:12},
  personalRoom:{flexDirection:"row-reverse",alignItems:"center",gap:12,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E0E6E2",borderRadius:20,padding:15,marginBottom:10},
  personalIcon:{width:46,height:46,borderRadius:15,backgroundColor:"#19C995",alignItems:"center",justifyContent:"center"},personalIconText:{fontSize:22,color:"#07382D"},mePage:{paddingHorizontal:20,paddingTop:18,paddingBottom:100},
  profileCard:{flexDirection:"row-reverse",alignItems:"center",gap:12,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E0E6E2",borderRadius:20,padding:15,marginBottom:14},
  avatar:{width:54,height:54,borderRadius:27,backgroundColor:"#D9E8E2",alignItems:"center",justifyContent:"center"},avatarText:{fontSize:23,fontWeight:"900",color:"#173B32"},meName:{fontSize:17,fontWeight:"900",color:"#26352F",textAlign:"right"},onlineDot:{color:"#19C995"},
  menuRow:{flexDirection:"row-reverse",alignItems:"center",gap:12,paddingVertical:17,borderBottomWidth:1,borderBottomColor:"#E5E9E7"},menuIcon:{fontSize:19,color:"#19B98B",width:28,textAlign:"center"},menuLabel:{flex:1,color:"#34433D",fontSize:14,fontWeight:"800",textAlign:"right"},
  signOut:{marginTop:18,borderWidth:1,borderColor:"#E5CACA",borderRadius:14,padding:13,alignItems:"center"},signOutText:{color:"#C94A4A",fontWeight:"800"},
  hero:{marginTop:50,backgroundColor:"#FFFFFF",borderColor:"#E1E7E3",borderWidth:1,borderRadius:24,padding:24},
  eyebrow:{color:"#19B98B",fontSize:13,marginBottom:18},heroTitle:{fontSize:27,fontWeight:"900",color:"#26352F",marginBottom:12},body:{fontSize:14,lineHeight:24,color:"#66736E",marginBottom:24},
  status:{borderWidth:1,borderRadius:16,paddingVertical:5,paddingHorizontal:8},
});
