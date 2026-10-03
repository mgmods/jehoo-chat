import "../src/polyfills";
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { registerGlobals } from "@livekit/react-native";
import { supabase } from "@/lib/supabase";

registerGlobals();

type SplashSettings = { image_url: string; duration_seconds: number };

export default function RootLayout() {
  const [splash, setSplash] = useState<SplashSettings | null>(null);
  const [splashLoading, setSplashLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const timerStarted = useRef(false);

  useEffect(() => {
    let active = true;
    let settled = false;
    const failSafe = setTimeout(() => {
      if (active && !settled) {
        setSplashLoading(false);
        setShowSplash(false);
      }
    }, 5000);

    async function loadSplash() {
      if (!supabase) {
        if (active) {
          setSplashLoading(false);
          setShowSplash(false);
        }
        return;
      }
      try {
        const { data, error } = await supabase
          .from("app_splash_settings")
          .select("image_url,duration_seconds")
          .eq("id", "default")
          .maybeSingle();
        if (!active) return;
        if (!error && data?.image_url) {
          setSplash({
            image_url: data.image_url,
            duration_seconds: Math.max(1, Math.min(15, Number(data.duration_seconds) || 5)),
          });
        } else {
          setShowSplash(false);
        }
      } catch {
        if (active) setShowSplash(false);
      } finally {
        settled = true;
        if (active) setSplashLoading(false);
      }
    }
    void loadSplash();
    return () => {
      active = false;
      clearTimeout(failSafe);
    };
  }, []);

  useEffect(() => {
    if (!splash) return;
    const fallback = setTimeout(() => setShowSplash(false), (splash.duration_seconds + 5) * 1000);
    return () => clearTimeout(fallback);
  }, [splash]);

  function startSplashTimer() {
    if (!splash || timerStarted.current) return;
    timerStarted.current = true;
    setTimeout(() => setShowSplash(false), splash.duration_seconds * 1000);
  }

  return <>
    <StatusBar style="light" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A1118" } }} />
    {showSplash && <View style={styles.splash}>
      {splash ? <Image
        source={{ uri: splash.image_url }}
        resizeMode="contain"
        style={styles.image}
        onLoad={startSplashTimer}
        onError={startSplashTimer}
        accessibilityLabel="JEHOO CHAT splash screen"
      /> : <View style={styles.brand}>
        <Text style={styles.brandText}>JEHOO <Text style={styles.dot}>●</Text> CHAT</Text>
        <Text style={styles.subtitle}>VOICE · CHAT · COMMUNITY</Text>
        {splashLoading && <Text style={styles.subtitle}>جارٍ التحميل…</Text>}
      </View>}
    </View>}
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
  brand: { alignItems: "center", gap: 10 },
  brandText: { color: "#F2F7FA", fontSize: 30, fontWeight: "900", letterSpacing: 2 },
  dot: { color: "#31D6B0" },
  subtitle: { color: "#94A3B8", fontSize: 10, letterSpacing: 3 },
});
