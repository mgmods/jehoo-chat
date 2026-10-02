-- Run in Supabase SQL Editor. Safe to re-run for existing Jehoo profiles.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  public_id integer unique,
  display_name text not null default '',
  bio text not null default '',
  country text not null default '',
  avatar_url text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists public_id integer;

create or replace function public.generate_jehoo_public_id()
returns trigger language plpgsql security definer set search_path = public
as $$
declare candidate integer;
begin
  if new.public_id is null then
    perform pg_advisory_xact_lock(731942817);
    loop
      candidate := floor(100000 + random() * 900000)::integer;
      exit when not exists (select 1 from public.profiles where public_id = candidate);
    end loop;
    new.public_id := candidate;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_generate_public_id on public.profiles;
create trigger profiles_generate_public_id before insert on public.profiles
for each row execute function public.generate_jehoo_public_id();

-- Backfill existing accounts; unique constraint below protects all future assignments.
do $$
declare r record; candidate integer;
begin
  for r in select id from public.profiles where public_id is null loop
    loop
      candidate := floor(100000 + random() * 900000)::integer;
      exit when not exists (select 1 from public.profiles where public_id = candidate);
    end loop;
    update public.profiles set public_id = candidate where id = r.id;
  end loop;
end $$;
-- Create a profile and public ID automatically for every new Supabase Auth account.
create or replace function public.handle_new_jehoo_user()
returns trigger language plpgsql security definer set search_path = public
as $function$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1), 'عضو Jehoo'))
  on conflict (id) do nothing;
  return new;
end;
$function$;
drop trigger if exists on_auth_user_created_jehoo_profile on auth.users;
create trigger on_auth_user_created_jehoo_profile
after insert on auth.users for each row execute function public.handle_new_jehoo_user();

-- Backfill any existing Auth accounts that do not yet have a profile.
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(coalesce(u.email, ''), '@', 1), 'عضو Jehoo')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

create unique index if not exists profiles_public_id_unique on public.profiles(public_id);
alter table public.profiles alter column public_id set not null;

alter table public.profiles enable row level security;
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Users can delete their own profile" on public.profiles;
create policy "Authenticated users can view profiles" on public.profiles for select to authenticated using (true);
create policy "Users can insert their own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users can delete their own profile" on public.profiles for delete to authenticated using (auth.uid() = id);

create table if not exists public.user_follows (
  id bigint generated always as identity primary key,
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_follows_no_self check (follower_id <> following_id),
  constraint user_follows_unique unique (follower_id, following_id)
);
create table if not exists public.user_blocks (
  id bigint generated always as identity primary key,
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_blocks_no_self check (blocker_id <> blocked_id),
  constraint user_blocks_unique unique (blocker_id, blocked_id)
);
create table if not exists public.direct_messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  deleted_for_sender boolean not null default false,
  deleted_for_receiver boolean not null default false,
  constraint direct_messages_no_self check (sender_id <> receiver_id)
);
create index if not exists direct_messages_sender_created_idx on public.direct_messages(sender_id, created_at desc);
create index if not exists direct_messages_receiver_created_idx on public.direct_messages(receiver_id, created_at desc);

alter table public.user_follows enable row level security;
alter table public.user_blocks enable row level security;
alter table public.direct_messages enable row level security;

drop policy if exists "Users can view follows involving them" on public.user_follows;
drop policy if exists "Users can follow as themselves" on public.user_follows;
drop policy if exists "Users can unfollow as themselves" on public.user_follows;
create policy "Users can view follows involving them" on public.user_follows for select to authenticated using (auth.uid() = follower_id or auth.uid() = following_id);
create policy "Users can follow as themselves" on public.user_follows for insert to authenticated with check (auth.uid() = follower_id and follower_id <> following_id);
create policy "Users can unfollow as themselves" on public.user_follows for delete to authenticated using (auth.uid() = follower_id);

drop policy if exists "Users can view their blocks" on public.user_blocks;
drop policy if exists "Users can block as themselves" on public.user_blocks;
drop policy if exists "Users can unblock as themselves" on public.user_blocks;
create policy "Users can view their blocks" on public.user_blocks for select to authenticated using (auth.uid() = blocker_id);
create policy "Users can block as themselves" on public.user_blocks for insert to authenticated with check (auth.uid() = blocker_id and blocker_id <> blocked_id);
create policy "Users can unblock as themselves" on public.user_blocks for delete to authenticated using (auth.uid() = blocker_id);

drop policy if exists "Participants can read their messages" on public.direct_messages;
drop policy if exists "Users can send messages when not blocked" on public.direct_messages;
drop policy if exists "Participants can soft-delete messages for themselves" on public.direct_messages;
create policy "Participants can read their messages" on public.direct_messages for select to authenticated using (
  (auth.uid() = sender_id and not deleted_for_sender) or
  (auth.uid() = receiver_id and not deleted_for_receiver)
);
create policy "Users can send messages when not blocked" on public.direct_messages for insert to authenticated with check (
  auth.uid() = sender_id and sender_id <> receiver_id and
  not exists (select 1 from public.user_blocks b where
    (b.blocker_id = sender_id and b.blocked_id = receiver_id) or
    (b.blocker_id = receiver_id and b.blocked_id = sender_id))
);
create or replace function public.protect_direct_message_updates()
returns trigger language plpgsql security definer set search_path = public
as $function$
begin
  if new.id is distinct from old.id
     or new.sender_id is distinct from old.sender_id
     or new.receiver_id is distinct from old.receiver_id
     or new.body is distinct from old.body
     or new.created_at is distinct from old.created_at then
    raise exception 'Message content and participants cannot be changed';
  end if;

  if auth.uid() = old.sender_id then
    if new.deleted_for_receiver is distinct from old.deleted_for_receiver then
      raise exception 'Sender can only delete messages from their own chat history';
    end if;
  elsif auth.uid() = old.receiver_id then
    if new.deleted_for_sender is distinct from old.deleted_for_sender then
      raise exception 'Receiver can only delete messages from their own chat history';
    end if;
  else
    raise exception 'Not allowed to update this message';
  end if;
  return new;
end;
$function$;
drop trigger if exists protect_direct_message_updates on public.direct_messages;
create trigger protect_direct_message_updates before update on public.direct_messages
for each row execute function public.protect_direct_message_updates();

create policy "Participants can soft-delete messages for themselves" on public.direct_messages for update to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id)
with check (auth.uid() = sender_id or auth.uid() = receiver_id);

grant select, insert, update, delete on public.profiles, public.user_follows, public.user_blocks, public.direct_messages to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Enable direct_messages in Supabase Dashboard > Database > Replication / Realtime,
-- or run this once if it is not already in the publication:
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
exception when undefined_object then null;
end $$;
