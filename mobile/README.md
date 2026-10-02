# JEHOO CHAT Mobile

Expo Router + React Native + TypeScript mobile app.

## Run
- Install Node.js 20+
- Run `npm install` inside this directory.
- Copy the environment values from `.env.example` to `.env`.
- Configure Google OAuth client IDs in Google Cloud and enable Google provider in Supabase Auth.
- Run `npx expo start`.

The initial screen uses Supabase Auth and reads voice rooms from PostgreSQL; it does not fabricate room data. LiveKit room joining and microphone seat state are the next implementation phase. Only the publishable Supabase key belongs in the mobile app.
