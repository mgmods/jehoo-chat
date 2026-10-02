# JEHOO CHAT Architecture

## Runtime boundaries
- `mobile/`: Expo + React Native + TypeScript. Public client uses only Supabase publishable key; no service-role or LiveKit API secret.
- `admin/`: Next.js + TypeScript. Browser uses publishable key and a signed-in staff session; every protected query is also authorized by RLS or an Edge Function.
- `supabase/migrations/`: versioned PostgreSQL schema, constraints, indexes and RLS.
- `supabase/functions/`: server-side privileged operations (LiveKit token issuance, wallet ledger operations, gift transfers, staff actions, payment webhooks).
- `packages/shared/`: shared TypeScript types, validation schemas and i18n keys.
- LiveKit carries realtime audio; PostgreSQL stores durable room/seat/role state. LiveKit credentials remain server-side.

## Database domains and relationships
- Identity: `auth.users 1:1 profiles`; `profiles 1:1 user_settings`; `profiles 1:1 wallets`. A database trigger bootstraps profile, settings and wallet on signup.
- Authorization: `app_roles M:N app_permissions` through `role_permissions`; users are assigned roles through `admin_user_roles`. `private.has_permission(permission)` is the backend policy helper. Client cannot grant roles or edit permission mappings.
- Rooms: `profiles 1:N rooms`; `rooms 1:20 room_seats`; `rooms M:N profiles` through `room_members`; room bans and mic requests are separately stored.
- Messaging: `conversations M:N profiles` through `conversation_members`; `conversations 1:N messages`; messages can reply to another message and later attach media stored in private Storage buckets.
- Economy: `profiles 1:1 wallets`; `wallets 1:N wallet_transactions`. Balances are not client-writable. Server functions must update balances and ledger atomically, use idempotency keys, and validate all amounts.
- Content/admin: `banners` support scheduling and ordering; `app_settings` stores controlled configuration; `audit_logs` is append-only from application roles and readable only with permission.
- Planned next domains: gifts/gift_transactions; VIP levels and entitlements; products/orders/payment webhooks; agencies/members/commissions; events/participants/rewards; referrals; reports; support tickets; notifications; analytics aggregates; push tokens.

## Roles and authorization
- USER: own profile/settings, participating conversations, own wallet/ledger reads.
- MODERATOR: explicit room/message/report moderation permissions only.
- MANAGER: operational permissions explicitly seeded in role_permissions; cannot manage staff.
- ADMIN: broad operational permissions but cannot manage staff or elevate self.
- SUPER_ADMIN: staff and platform configuration permissions. Assignment must be granted through a trusted administrative process; never from a mobile request.
- Permissions are enforced server-side (RLS/Edge Functions), not just by hiding UI controls. Administrative access to stored conversations is separately permission-gated and must be audit logged before Chat Monitoring is shipped.

## Data flows
1. Google OAuth -> Supabase Auth -> auth.users trigger creates profile/settings/zero-balance wallet.
2. Mobile obtains a short-lived Supabase access token -> RLS limits row access by identity and conversation membership.
3. Voice join -> Edge Function validates JWT, room state, bans, role and seat permissions -> short-lived LiveKit token -> LiveKit audio.
4. Coin purchase -> provider verifies webhook server-side -> idempotent ledger entry and wallet balance update in one database transaction.
5. Gift -> server validates catalog, sender balance, receiver, room/chat context -> atomically debit/credit ledger -> Realtime notification.
6. Admin action -> Edge Function checks permission and fresh session -> performs action -> writes audit log. Admin browser never receives service-role credentials.

## Delivery order
1. Core schema and RLS (current phase).
2. Auth/session lifecycle and role bootstrap; add RLS/security tests.
3. Server-only wallet ledger RPC/Edge Functions and idempotency tests.
4. LiveKit token endpoint and 20-seat state machine.
5. Messaging and private Storage policies.
6. Gifts, VIP, store and verified payment webhooks.
7. Agencies, events, rankings, notifications and support.
8. Admin dashboard, chat monitoring with audit trail, analytics and production hardening.

## Important current limitations
The core migration establishes the foundation, not the entire product. The legacy `App.js` still contains prototype room UI and text explicitly stating that voice/chat are not wired yet. Do not advertise those features as complete until their server flows and tests are implemented.
