import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
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
      <View><Text style={s.brand}>JEHOO <Text style={s.mint}>●</Text> CHAT</Text><Text style={s.subtitle}>{ar ? "مساحتك، صوتك، أصدقاؤك" : "Your space, your voice, your friends"}</Text></View>
      <Pressable style={s.language} onPress={() => setLocale(ar ? "en" : "ar")}><Text style={s.languageText}>{ar ? "English" : "العربية"}</Text></Pressable>
    </View> : null}
    <ScrollView style={s.contentScroll} contentContainerStyle={s.contentContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {!session ? <View style={s.hero}>
        <Text style={s.eyebrow}>{ar ? "مساحتك، صوتك، أصدقاؤك" : "Your space, your voice, your friends"}</Text>
        <Text style={s.heroTitle}>{ar ? "أهلاً بك في جيهو" : "Welcome to JEHOO"}</Text>
        <Text style={s.body}>{ar ? "سجّل الدخول لعرض الغرف الحقيقية المرتبطة بحسابك." : "Sign in to discover live rooms connected to your account."}</Text>
        <Pressable disabled={authBusy} onPress={signIn} style={s.primary}>{authBusy ? <ActivityIndicator color="#06251E" /> : <Text style={s.primaryText}>{ar ? "المتابعة باستخدام Google" : "Continue with Google"}</Text>}</Pressable>
      </View> : tab === "rooms" ? <View>
        <View style={s.topLinks}>
          <View style={s.topLinkGroup}>
            <Pressable onPress={() => setTab("rooms")}><Text style={s.topLinkActive}>{ar ? "ملكي" : "Mine"}</Text></Pressable>
            <Pressable onPress={() => { setTab("rooms"); void loadRooms(); }}><Text style={s.topLink}>{ar ? "الفعاليات" : "Events"}</Text></Pressable>
            <Pressable onPress={() => setShowCreateRoom(true)}><Text style={s.topLink}>{ar ? "حفلة" : "Party"}</Text></Pressable>
          </View>
          <View style={s.quickIcons}>
            <Pressable accessibilityRole="button" onPress={() => setTab("rooms")} style={s.quickButton}><Text style={s.quickIcon}>⌂</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => void loadRooms()} style={s.quickButton}><Text style={s.quickIcon}>⌕</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setShowCreateRoom(true)} style={s.quickButton}><Text style={s.quickIcon}>🎉</Text></Pressable>
          </View>
        </View>
        <Pressable onPress={() => { setTab("rooms"); void loadRooms(); }} style={s.banner}>
          <View style={s.bannerGlow}><Text style={s.bannerKicker}>JEHOO ✦ LIVE</Text><Text style={s.bannerTitle}>{ar ? "مكافآت الشحن" : "Recharge Rewards"}</Text><Text style={s.bannerText}>{ar ? "ادخل غرفتك المفضلة وتعرّف على أصدقاء جدد" : "Join your favorite rooms and meet new friends"}</Text><View style={s.bannerPill}><Text style={s.bannerPillText}>{ar ? "اكتشف الآن  ←" : "Explore now  →"}</Text></View></View>
        </Pressable>
        <View style={s.categoryRow}>{[[ "👑", ar ? "ثراء" : "Rich", "#F3B54A"],["💎", "CP", "#A44CF0"],["🏆", ar ? "قربي" : "Nearby", "#3997E8"]].map(([emoji,label,color]) => <Pressable key={label} style={[s.categoryCard,{backgroundColor:color+"22",borderColor:color}]} onPress={() => { setTab("rooms"); void loadRooms(); }}><Text style={s.categoryEmoji}>{emoji}</Text><Text style={s.categoryLabel}>{label}</Text></Pressable>)}</View>
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
        {loading ? <ActivityIndicator style={{marginTop:32}} color="#31D6B0"/> : error ? <View style={s.empty}><Text style={s.error}>{error}</Text></View> : rooms.length === 0 ? <View style={s.empty}><Text style={s.emptyTitle}>{ar ? "لا توجد غرف بعد" : "No rooms yet"}</Text></View> : <View style={s.roomGrid}>{rooms.map(item => <Pressable key={item.id} onPress={() => router.push({pathname:"/room/[id]",params:{id:item.id}})} style={s.room}><View style={[s.roomCover,{backgroundColor:item.is_featured?"#0C5848":"#153A35"}]}><Text style={s.roomEmoji}>{item.is_featured?"👑":"🎙️"}</Text><Text style={s.roomCoverHint}>{item.is_featured?(ar?"مميز":"FEATURED"):(ar?"غرفة صوتية":"VOICE ROOM")}</Text><View style={s.liveBadge}><Text style={s.liveBadgeText}>{item.status==="active"?(ar?"● مباشر":"● LIVE"):(ar?"مفتوحة":"OPEN")}</Text></View></View><View style={s.roomInfo}><Text style={s.roomName} numberOfLines={1}>{item.name}</Text><Text style={s.subtitle} numberOfLines={2}>{item.description || (ar ? "غرفة صوتية على جيهو" : "JEHOO voice room")}</Text><View style={s.roomBottom}><Text style={s.roomMeta}>● {ar?"انضم الآن":"Join now"}</Text><Text style={s.chevron}>‹</Text></View></View></Pressable>)}</View>}
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
