-- Official announcements + Expo push delivery.
create table if not exists public.official_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  content_type text not null default 'text' check (content_type in ('text','image','link','html')),
  content_url text,
  html_content text,
  target_type text not null default 'all' check (target_type in ('all','user')),
  target_user_id uuid references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  pinned boolean not null default true
);
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text,
  updated_at timestamptz not null default now()
);
alter table public.official_messages enable row level security;
alter table public.push_tokens enable row level security;
drop policy if exists "Users read official messages" on public.official_messages;
create policy "Users read official messages" on public.official_messages for select to authenticated
using (target_type = 'all' or target_user_id = auth.uid());
drop policy if exists "Users manage own push token" on public.push_tokens;
create policy "Users manage own push token" on public.push_tokens for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on public.official_messages to authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;
