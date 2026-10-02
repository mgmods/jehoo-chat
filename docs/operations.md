# JEHOO CHAT Operations and First Admin

## Google OAuth
1. Configure Google OAuth client credentials in Supabase Auth > Providers > Google.
2. Add the app redirect URI jehoochat://auth/callback to Supabase Auth > URL Configuration > Redirect URLs.
3. Add the dashboard's local URL (for example http://localhost:3000) and the production admin URL to the same allow-list.
4. Test OAuth with a non-privileged account before granting staff access.

## Bootstrap the first Super Admin
The system intentionally does not grant elevated roles automatically. First, sign in to the admin app with the intended Google account so the Supabase Auth user and profile are created. Then, from the Supabase SQL Editor using an owner-level session, replace the email below and run:

    insert into public.admin_user_roles (user_id, role_id, granted_by)
    select id, 'SUPER_ADMIN', id
    from auth.users
    where lower(email) = lower('YOUR-ADMIN-EMAIL@example.com')
    on conflict (user_id, role_id) do update
    set disabled_at = null;

Verify exactly one intended account was matched before running this query. Do not create an admin bootstrap endpoint that accepts a user-supplied email without a separate, trusted bootstrap secret. The first Super Admin can then grant staff roles through a future audited staff-management endpoint.

## Secrets
The Edge Functions expect Supabase's server-side environment variables and LiveKit secrets to be set in Supabase Function Secrets. Do not add them to GitHub files or mobile/admin environment variables. Publishable Supabase keys are expected to be present in client configuration.

## Database restore and backup
Use Supabase's managed backup/PITR features according to the project's plan and retention settings. For a separate recovery copy, schedule encrypted pg_dump exports from a trusted CI runner or secure operator environment; store encryption keys separately from backups and restrict download access. Include a documented restore drill to a staging project and verify profiles, wallets, ledger rows, room records, conversations, and audit logs before relying on the backup. Do not export private message bodies into application error logs.

## Environments
Create separate Supabase projects for development, staging and production. Keep their Auth redirect URLs, OAuth clients, LiveKit rooms/credentials, payment provider keys and database backups separated. Deploy migrations to staging first, run supabase/tests/security_invariants.sql, verify auth/RLS and then promote the same migration files to production.
