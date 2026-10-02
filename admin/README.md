# JEHOO CHAT Admin Dashboard

Independent Next.js + TypeScript app. Arabic RTL is the default; the dashboard includes an English LTR toggle.

## Local setup
1. `cd admin && npm install`
2. Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable key.
3. Enable Google OAuth in Supabase Auth and add the local and production redirect URLs.
4. `npm run dev`

The browser uses only the Supabase publishable key. Never add the service-role key or LiveKit API secret to `NEXT_PUBLIC_*` variables.

## Authorization
The dashboard reads the current user's active staff role and role-permission mappings. Data queries are still protected by PostgreSQL RLS. The interface is not the security boundary; every sensitive mutation must be implemented as a permission-checked Edge Function with audit logging.

## Current scope
This is the first functional shell: Google OAuth redirect, staff-role gate, permission-aware summary queries, recent-room list, responsive layout, and Arabic/English direction toggle. Other navigation sections are intentionally not presented as implemented until their corresponding APIs and pages are added.
