import { Redirect } from "expo-router";

// The OAuth session is processed by openAuthSessionAsync in the sign-in screen.
// Keep Expo Router from displaying its Unmatched Route page for the deep link.
export default function AuthCallbackRoute() {
  return <Redirect href="/" />;
}
