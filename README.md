# Jehoo Chat

Arabic-first mobile social and voice-room app starter built with Expo + React Native. Designed to evolve: screens and sample room data are currently kept in `App.js`, so features can be changed and moved into modules as the project grows.

## Current prototype
- Arabic home screen and sample voice-room cards
- Room screen with speaker-seat layout and sample chat
- Profile, gifts/coins presentation, and bottom navigation
- Sign-in/sign-up form presentation

**Important:** this is a UI starter only. Audio is not streamed; messages, authentication, uploads, notifications, wallet, VIP purchases, agencies, and admin actions are not connected yet.

## Run
Requires Node.js LTS and npm. Install Expo Go on your phone.

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go, or use `npm run android` / `npm run ios`. Local iOS builds require macOS and Xcode.

## Production services to add
- Auth and database: Supabase Auth + PostgreSQL (or equivalent) with row-level security.
- Realtime chat/presence: Supabase Realtime or authenticated WebSockets.
- Voice/video: LiveKit, Agora, or WebRTC; create temporary room tokens on a trusted server.
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
