import { useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { supabase } from "@/lib/supabase";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

type SplashSettings = { image_url: string; duration_seconds: number };

export default function RootLayout() {
  const [splash, setSplash] = useState<SplashSettings | null>(null);
  const [splashLoading, setSplashLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(false);
  const splashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);


  useEffect(() => {
    if (!supabase || !Device.isDevice) return;
    let active = true;
    const register = async (userId: string) => {
      try {
        const permission = await Notifications.getPermissionsAsync();
        let status = permission.status;
        if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
        if (status !== "granted" || !active) return;
        const token = (await Notifications.getExpoPushTokenAsync()).data;
        if (!active) return;
        await supabase?.from("push_tokens").upsert({ user_id: userId, expo_push_token: token, platform: "mobile", updated_at: new Date().toISOString() }, { onConflict: "expo_push_token" });
        await Notifications.setNotificationChannelAsync("official", { name: "الرسائل الرسمية", importance: Notifications.AndroidImportance.MAX });
      } catch (error) { console.warn("Push registration failed", error); }
    };
    void supabase.auth.getUser().then(({data}) => { if (data.user) void register(data.user.id); });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{ if(session?.user) void register(session.user.id); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!supabase) {
      setSplashLoading(false);
      setShowSplash(false);
      return;
    }
    const client = supabase as NonNullable<typeof supabase>;
    let active = true;
    let settled = false;
    const failSafe = setTimeout(() => {
      if (active && !settled) {
        setSplashLoading(false);
        setShowSplash(false);
      }
    }, 5000);

    const applySettings = (row: any) => {
      if (!active) return;
      if (splashTimeout.current) clearTimeout(splashTimeout.current);
      if (row?.image_url) {
        setSplash({
          image_url: row.image_url,
          duration_seconds: Math.max(1, Math.min(15, Number(row.duration_seconds) || 5)),
        });
        setShowSplash(true);
      } else {
        setSplash(null);
        setShowSplash(false);
      }
    };

    async function loadSplash() {
      try {
        const { data, error } = await client
          .from("app_splash_settings")
          .select("image_url,duration_seconds")
          .eq("id", "default")
          .maybeSingle();
        if (!active) return;
        if (!error) applySettings(data);
        else setShowSplash(false);
      } catch {
        if (active) setShowSplash(false);
      } finally {
        settled = true;
        if (active) setSplashLoading(false);
      }
    }
    void loadSplash();

    const channel = client
      .channel("app-splash-live-updates")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "app_splash_settings",
        filter: "id=eq.default",
      }, (payload) => {
        if (payload.eventType === "DELETE") applySettings(null);
        else applySettings(payload.new);
      })
      .subscribe();

    return () => {
      active = false;
      clearTimeout(failSafe);
      if (splashTimeout.current) clearTimeout(splashTimeout.current);
      void client.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!splash || !showSplash || splashLoading) return;
    if (splashTimeout.current) clearTimeout(splashTimeout.current);
    splashTimeout.current = setTimeout(() => setShowSplash(false), splash.duration_seconds * 1000);
    return () => {
      if (splashTimeout.current) clearTimeout(splashTimeout.current);
    };
  }, [splash, showSplash, splashLoading]);

  function skipSplash() {
    if (splashTimeout.current) clearTimeout(splashTimeout.current);
    setShowSplash(false);
  }

  return <>
    <StatusBar style="light" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A1118" } }} />
    {showSplash && splash?.image_url ? <View style={styles.splash}>
      <Image
        source={{ uri: splash.image_url }}
        resizeMode="cover"
        style={styles.image}
        accessibilityLabel="JEHOO CHAT splash screen"
      />
      <Pressable accessibilityRole="button" accessibilityLabel="تخطي شاشة البداية" onPress={skipSplash} style={styles.skipButton}><Text style={styles.skipText}>تخطي ›</Text></Pressable>
    </View> : null}
  </>;
}

const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    backgroundColor: "#0A1118",
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: "100%", height: "100%" },
  skipButton: { position: "absolute", bottom: 48, right: 24, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.42)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)" },
  skipText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
