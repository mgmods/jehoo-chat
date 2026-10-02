# Jehoo Chat

Arabic-first mobile social and voice-room app starter built with Expo + React Native. Designed to evolve: screens and sample room data are currently kept in `App.js`, so features can be changed and moved into modules as the project grows.

## Current prototype
- Arabic home screen and sample voice-room cards
- Room screen with speaker-seat layout and sample chat
- Profile with a unique six-digit numeric Jehoo ID, gifts/coins presentation, and bottom navigation
- Private one-to-one messaging, inbox, message copy, follow/unfollow, block/unblock, and delete-chat-for-yourself controls (requires Supabase SQL setup)
- Sign-in/sign-up form presentation

**Important:** the app now includes a LiveKit client connection flow, but audio is not usable until you deploy and configure a trusted token-issuing backend and test on physical devices. Room seats remain placeholders. The app is still a prototype; messages, authentication, uploads, notifications, wallet, VIP purchases, agencies, and admin actions are not connected yet.

## Run
Requires Node.js LTS and npm. Install Expo Go on your phone.

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go, or use `npm run android` / `npm run ios`. Local iOS builds require macOS and Xcode.

## Enable private messages and Jehoo IDs
1. Open your Supabase project and run the complete `supabase-schema.sql` file in **SQL Editor**. It adds the six-digit unique `public_id`, creates profiles automatically for new Auth users, and sets up follows, blocks, private messages, and row-level security policies.
2. Confirm `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set in your local environment. Never put a service-role key in the app.
3. Install updated dependencies with `npm install` so `expo-clipboard` is installed. Restart Expo after installation.
4. Sign in with two test accounts. Copy the six-digit Jehoo ID from each profile, search that ID in Messages, send a message, and test follow, block, copy, and delete-chat behavior with both accounts.
5. If realtime message updates do not arrive, check that `direct_messages` is enabled in Supabase Database Replication / Realtime. The SQL attempts to add it to `supabase_realtime` where available.

Deleting a chat hides messages from the current user's side; it does not promise to erase messages from the other participant's history. Blocking prevents new messages in either direction through the database insert policy.

## Production services to add
- Auth and database: Supabase Auth + PostgreSQL with row-level security. Email/password and Google ID-token sign-in UI are integrated; provider setup is required.
- Profile: editable display name, bio, country and avatar URL stored in a `profiles` table when configured.
- Realtime chat/presence: Supabase Realtime or authenticated WebSockets.
- Voice: LiveKit React Native client is wired in. Deploy a trusted token endpoint and configure `EXPO_PUBLIC_VOICE_TOKEN_URL` to return `{ "serverUrl": "wss://...", "participantToken": "..." }`. The endpoint must authenticate users and mint short-lived room-scoped tokens; never ship API secrets in the app. LiveKit Cloud or a self-hosted LiveKit server is required.
- Media: private object storage and signed URLs.
- Push notifications: Expo Notifications, APNs, FCM, and a backend sender.
- Coins/VIP: Apple/Google billing where applicable; validate receipts server-side and keep a server-side ledger.
- Admin: protected dashboard, server-side permissions, and audit logs.

## Security
`EXPO_PUBLIC_*` values are bundled in the app and are not secrets. Never commit service-role keys, database passwords, payment secrets, or voice-provider secrets. Keep secrets on a trusted backend or in CI secret storage.

Before launch, implement password recovery, access policies, rate limits, report/block tools, account deletion, moderation, privacy and age policies, upload protection, purchase verification, and device testing.

## Roadmap
1. Backend schema, authentication, and editable profiles.
2. Direct/group messaging and media uploads.
3. Live voice rooms and moderator controls.
4. Gifts, wallet ledger, VIP, agencies, and verified purchases.
5. Push notifications, admin dashboard, monitoring, and release builds.

No license has been selected yet; choose one before accepting outside contributions.


## Live voice setup (not yet production-ready)
1. Create a LiveKit Cloud project or deploy a LiveKit server.
2. Implement a trusted backend endpoint that validates the signed-in user and issues a short-lived token scoped to the requested room. Do not accept arbitrary identities or room permissions from untrusted clients.
3. Set `EXPO_PUBLIC_VOICE_TOKEN_URL` in your local Expo environment to the HTTPS endpoint URL. This variable is public; it must not contain credentials.
4. Install dependencies with `npm install`, then use a development build (LiveKit native WebRTC modules require native support; Expo Go alone is not sufficient). Run `npx expo prebuild` and build with EAS or native Android/iOS toolchains.
5. Test microphone permissions, join/leave, backgrounding, audio route changes, network loss, moderation and multiple participants on real Android and iOS devices.

The client code is integration scaffolding only. No token service is included, and voice has not been connected or device-tested in this repository yet.


## Supabase hardening and voice authentication
- The production project has an applied hardening migration that restricts trigger-function RPC execution, protects the six-digit Jehoo ID from client changes, and adds missing foreign-key indexes.
- The app sends the signed-in Supabase access token to the configured LiveKit token endpoint and no longer asks the client to choose its own participant identity. The token endpoint must verify that JWT and derive the identity from the verified user; this repository does not include that endpoint.
- Set `EXPO_PUBLIC_VOICE_TOKEN_URL` only to your trusted HTTPS token service. Audio still requires LiveKit server credentials stored on the backend, a native development build, and real-device testing.
- The GitHub code changes are staged on `fix/supabase-hardening` for review; they are not merged into `main` yet.


## Build an Android APK in the cloud

The GitHub Actions workflow **Android APK** creates an installable debug APK without needing Android Studio on your computer.

1. Open the repository's **Actions** tab and select **Android APK**.
2. After the workflow finishes successfully, open the run and download the `jehoo-chat-android-apk` artifact.
3. Extract the ZIP and install `app-debug.apk` on an Android phone. You may need to allow installs from your browser or file manager.

The workflow uses the public Supabase URL/publishable key and the public LiveKit token endpoint URL as build-time configuration. LiveKit API secrets must remain in Supabase Function Secrets and must never be added to GitHub or the mobile app. The APK is a testing build, not a Play Store release. Voice rooms still require valid LiveKit secrets in Supabase and a successful real-device test.
