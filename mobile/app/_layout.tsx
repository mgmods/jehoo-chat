import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AudioSession, registerGlobals } from "@livekit/react-native";

registerGlobals();

export default function RootLayout() {
  useEffect(() => {
    AudioSession.configureAudio({
      android: { audioTypeOptions: { manageAudioFocus: true, audioMode: "communication", audioFocusMode: "gain" } },
    }).catch(() => undefined);
  }, []);
  return <>
    <StatusBar style="light" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A1118" } }} />
  </>;
}
