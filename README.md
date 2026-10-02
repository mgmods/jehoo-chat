# JEHOO CHAT

Arabic-first social voice-chat project being built in phases. The repository now contains a separate Expo/React Native TypeScript app, an independent Next.js admin dashboard, Supabase migrations, and server-side Edge Functions.

## Repository layout
- `mobile/` — Expo Router + React Native + TypeScript app.
- `admin/` — responsive Next.js + TypeScript dashboard (Arabic RTL default, English LTR toggle).
- `packages/shared/` — shared TypeScript role/permission types and Arabic/English strings.
- `supabase/migrations/` — PostgreSQL schema, relationships, RLS and privilege hardening.
- `supabase/functions/` — trusted server endpoints.
- `supabase/tests/security_invariants.sql` — SQL assertions for sensitive permission boundaries.
- `docs/architecture.md` — architecture, relationship map, authorization and data flows.
- `docs/operations.md` — setup and first-admin bootstrap steps.

## Mobile app
1. Use Node.js 20 or newer.
2. Run `cd mobile && npm install`.
3. Copy `.env.example` to `.env` and configure the Supabase URL and publishable key.
4. Enable Google as a provider in Supabase Auth and allow the redirect URI `jehoochat://auth/callback`.
5. Run `npx expo start`.

The mobile home loads actual rooms from PostgreSQL and shows loading, error and empty states. Room details read the 20 persisted seat slots and connect to LiveKit through a server-issued short-lived token. This first slice is not the entire requested feature set; microphone requests, seat mutations, chat, gifts and the rest of the product are still pending implementation and testing.

## Admin dashboard
1. Run `cd admin && npm install`.
2. Copy `.env.example` to `.env.local`.
3. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Allow the dashboard's local and production callback URLs in Supabase Auth.
5. Run `npm run dev`.

The current dashboard includes Google OAuth, staff-role gating, permission-aware summary queries, recent rooms, and responsive Arabic/English layout. Sections without backend endpoints are intentionally disabled rather than represented as working controls.

## Backend and migrations
The core migration adds profiles/settings, role/permission mappings, wallets/ledger, rooms and 20-seat records, room membership/requests/bans, conversations/messages, banners, audit logs and app settings. New Auth users receive a profile, settings, empty wallet and the baseline USER role.

The deployed `livekit-token` function validates a Supabase user, looks up the real room, checks room bans and room state, and issues a short-lived LiveKit token with publishing rights based on room role. `wallet-admin-adjust` is restricted to the `wallet.adjust` permission and applies an idempotent ledger adjustment plus audit log in one database transaction. `chat-monitor-search` requires message-monitoring permissions and writes an audit record before returning stored messages.

## Android APK
The dedicated workflow is [Mobile Android APK](https://github.com/mgmods/jehoo-chat/actions/workflows/mobile-apk.yml). Open the latest successful run and download the `jehoo-chat-mobile-release` artifact. The older root-level Android workflow still builds the legacy prototype; use the mobile workflow for the modular app.

## Security
- Never put Supabase service-role keys, LiveKit API secrets, payment secrets or database passwords in mobile code, browser code or `EXPO_PUBLIC_*` values.
- Direct clients cannot update wallet balances, VIP level, XP, or staff assignments.
- Private conversation review is not permitted through direct staff table reads; the chat-monitoring Edge Function is the audited path.
- Run the SQL in `supabase/tests/security_invariants.sql` in a non-production test environment after migrations.
- OAuth providers and LiveKit secrets must be configured in Supabase's server-side settings before those flows can work.

## Current implementation status
This is an incremental build, not a claim that every requested module is finished. Payment provider verification, wallet top-up, gift transfers, VIP/store entitlements, agency commissions, push notifications, support tickets, full chat monitoring media viewer, complete admin CRUD, 2FA and automated integration tests remain future phases.
