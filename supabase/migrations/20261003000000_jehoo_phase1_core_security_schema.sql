-- JEHOO CHAT Phase 1 foundation schema.
-- This migration is additive: it does not drop or rewrite existing user data.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create sequence if not exists public.jehoo_public_id_seq;
alter table public.profiles
  alter column public_id set default nextval('public.jehoo_public_id_seq'),
  add column if not exists level integer not null default 1 check (level >= 1),
  add column if not exists xp bigint not null default 0 check (xp >= 0),
  add column if not exists vip_level integer not null default 0 check (vip_level >= 0),
  add column if not exists badges jsonb not null default '[]'::jsonb,
  add column if not exists locale text not null default 'ar' check (locale in ('ar','en')),
  add column if not exists status text not null default 'online' check (status in ('online','away','busy','invisible','offline')),
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.user_settings (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 locale text not null default 'ar' check (locale in ('ar','en')),
 theme text not null default 'dark' check (theme in ('dark','light','system')),
 notification_preferences jsonb not null default '{}'::jsonb,
 last_seen_at timestamptz,
 updated_at timestamptz not null default now()
);
create table if not exists public.app_roles (
 id text primary key check (id in ('USER','MODERATOR','MANAGER','ADMIN','SUPER_ADMIN')), label text not null
);
create table if not exists public.app_permissions (id text primary key, description text not null);
create table if not exists public.role_permissions (
 role_id text not null references public.app_roles(id) on delete cascade,
 permission_id text not null references public.app_permissions(id) on delete cascade,
 primary key(role_id,permission_id)
);
create table if not exists public.admin_user_roles (
 user_id uuid not null references public.profiles(id) on delete cascade,
 role_id text not null references public.app_roles(id),
 granted_by uuid references public.profiles(id),
 granted_at timestamptz not null default now(),
 disabled_at timestamptz,
 primary key(user_id,role_id)
);
insert into public.app_roles(id,label) values ('USER','User'),('MODERATOR','Moderator'),('MANAGER','Manager'),('ADMIN','Admin'),('SUPER_ADMIN','Super Admin') on conflict do nothing;
insert into public.app_permissions(id,description) values
('users.view','View user profiles'),('users.edit','Edit user profiles'),('users.ban','Ban users'),
('rooms.view','View rooms'),('rooms.manage','Manage rooms'),('rooms.kick','Kick room users'),('rooms.ban','Ban room users'),
('messages.view','Review stored messages'),('messages.search','Search stored messages'),('messages.media_view','View message media'),('messages.moderate','Moderate messages'),
('wallet.view','View wallets'),('transactions.view','View transactions'),('refunds.manage','Manage refunds'),
('gifts.manage','Manage gifts'),('vip.manage','Manage VIP'),('store.manage','Manage store'),
('agencies.manage','Manage agencies'),('banners.manage','Manage banners'),('events.manage','Manage events'),
('reports.manage','Manage reports'),('staff.manage','Manage staff'),('settings.manage','Manage settings'),
('audit_logs.view','View audit logs'),('support.manage','Manage support'),('analytics.view','View analytics')
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id) select 'SUPER_ADMIN',id from public.app_permissions on conflict do nothing;
insert into public.role_permissions(role_id,permission_id) select 'ADMIN',id from public.app_permissions where id <> 'staff.manage' on conflict do nothing;
insert into public.role_permissions(role_id,permission_id) select 'MANAGER',id from public.app_permissions where id in ('users.view','users.edit','users.ban','rooms.view','rooms.manage','rooms.kick','rooms.ban','messages.view','messages.search','messages.moderate','wallet.view','transactions.view','gifts.manage','vip.manage','store.manage','agencies.manage','banners.manage','events.manage','reports.manage','settings.manage','audit_logs.view','support.manage','analytics.view') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id) select 'MODERATOR',id from public.app_permissions where id in ('users.view','rooms.view','rooms.kick','messages.view','messages.moderate','reports.manage') on conflict do nothing;

create or replace function private.has_permission(required_permission text)
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists (
  select 1 from public.admin_user_roles ur join public.role_permissions rp on rp.role_id=ur.role_id
  where ur.user_id=(select auth.uid()) and ur.disabled_at is null and rp.permission_id=required_permission
 );
$$;
revoke all on function private.has_permission(text) from public,anon;
grant execute on function private.has_permission(text) to authenticated;

create table if not exists public.wallets (
 user_id uuid primary key references public.profiles(id) on delete restrict,
 coins bigint not null default 0 check(coins>=0), updated_at timestamptz not null default now()
);
create table if not exists public.wallet_transactions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete restrict,
 amount bigint not null check(amount<>0), balance_after bigint check(balance_after>=0),
 kind text not null check(kind in ('topup','gift_sent','gift_received','purchase','refund','reward','adjustment')),
 status text not null default 'completed' check(status in ('pending','completed','failed','refunded')),
 idempotency_key text not null, reference_id uuid, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), unique(user_id,idempotency_key)
);
create index if not exists wallet_transactions_user_created_idx on public.wallet_transactions(user_id,created_at desc);

create table if not exists public.rooms (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete restrict,
 name text not null check(char_length(name) between 1 and 80), description text not null default '', cover_url text,
 status text not null default 'active' check(status in ('active','locked','closed')),
 is_featured boolean not null default false, max_seats integer not null default 20 check(max_seats=20),
 livekit_room_name text not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists rooms_status_created_idx on public.rooms(status,created_at desc);
create table if not exists public.room_seats (
 room_id uuid not null references public.rooms(id) on delete cascade, seat_number integer not null check(seat_number between 1 and 20),
 status text not null default 'empty' check(status in ('empty','occupied','locked','reserved')),
 user_id uuid references public.profiles(id) on delete set null, reserved_for uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now(), primary key(room_id,seat_number), check(status<>'occupied' or user_id is not null)
);
create unique index if not exists room_seats_one_seat_per_user_idx on public.room_seats(room_id,user_id) where user_id is not null;
create table if not exists public.room_members (
 room_id uuid not null references public.rooms(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
 room_role text not null default 'listener' check(room_role in ('listener','speaker','moderator','co_host','host')),
 muted boolean not null default false, joined_at timestamptz not null default now(), primary key(room_id,user_id)
);
create table if not exists public.room_bans (
 room_id uuid not null references public.rooms(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
 banned_by uuid not null references public.profiles(id), reason text not null default '', expires_at timestamptz,
 created_at timestamptz not null default now(), primary key(room_id,user_id)
);
create table if not exists public.room_requests (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 request_type text not null check(request_type in ('microphone','invite')),
 status text not null default 'pending' check(status in ('pending','accepted','rejected','cancelled')),
 created_at timestamptz not null default now(), handled_by uuid references public.profiles(id), handled_at timestamptz
);
create table if not exists public.conversations (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('direct','group','room')),
 title text, created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 member_role text not null default 'member' check(member_role in ('member','admin')),
 last_read_at timestamptz, muted_until timestamptz, joined_at timestamptz not null default now(),
 primary key(conversation_id,user_id)
);
create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete restrict,
 message_type text not null default 'text' check(message_type in ('text','image','voice','gif','system','gift','file')),
 body text not null default '' check(char_length(body)<=10000), attachment_path text,
 reply_to uuid references public.messages(id) on delete set null, edited_at timestamptz, deleted_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at desc);
create index if not exists messages_sender_created_idx on public.messages(sender_id,created_at desc);
create table if not exists public.banners (
 id uuid primary key default gen_random_uuid(), title text not null, description text not null default '', image_path text not null,
 target_url text, sort_order integer not null default 0, is_active boolean not null default true,
 starts_at timestamptz, ends_at timestamptz, created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), check(ends_at is null or starts_at is null or ends_at>starts_at)
);
create index if not exists banners_active_order_idx on public.banners(is_active,sort_order);
create table if not exists public.audit_logs (
 id bigint generated always as identity primary key, actor_id uuid references public.profiles(id) on delete set null,
 action text not null, target_type text not null, target_id text, before_data jsonb, after_data jsonb, request_id text,
 created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create table if not exists public.app_settings (
 key text primary key, value jsonb not null, updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);

create or replace function public.jehoo_bootstrap_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 insert into public.profiles(id,public_id,display_name,avatar_url)
 values(new.id,nextval('public.jehoo_public_id_seq'),
  coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',split_part(coalesce(new.email,''),'@',1),'Jehoo User'),
  coalesce(new.raw_user_meta_data->>'avatar_url',new.raw_user_meta_data->>'picture','')) on conflict(id) do nothing;
 insert into public.user_settings(user_id) values(new.id) on conflict do nothing;
 insert into public.wallets(user_id) values(new.id) on conflict do nothing;
 return new;
end;
$$;
revoke all on function public.jehoo_bootstrap_new_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created_jehoo on auth.users;
create trigger on_auth_user_created_jehoo after insert on auth.users for each row execute function public.jehoo_bootstrap_new_user();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.app_roles enable row level security;
alter table public.app_permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.admin_user_roles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.rooms enable row level security;
alter table public.room_seats enable row level security;
alter table public.room_members enable row level security;
alter table public.room_bans enable row level security;
alter table public.room_requests enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.banners enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists profiles_read_authenticated on public.profiles;
create policy profiles_read_authenticated on public.profiles for select to authenticated using(true);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using((select auth.uid())=id) with check((select auth.uid())=id);
drop policy if exists user_settings_self on public.user_settings;
create policy user_settings_self on public.user_settings for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
drop policy if exists roles_read_authenticated on public.app_roles;
create policy roles_read_authenticated on public.app_roles for select to authenticated using(true);
drop policy if exists permissions_read_authenticated on public.app_permissions;
create policy permissions_read_authenticated on public.app_permissions for select to authenticated using(true);
drop policy if exists role_permissions_read_authenticated on public.role_permissions;
create policy role_permissions_read_authenticated on public.role_permissions for select to authenticated using(true);
drop policy if exists admin_roles_view_staff on public.admin_user_roles;
create policy admin_roles_view_staff on public.admin_user_roles for select to authenticated using(user_id=(select auth.uid()) or private.has_permission('staff.manage'));
drop policy if exists wallets_read_own_or_permitted on public.wallets;
create policy wallets_read_own_or_permitted on public.wallets for select to authenticated using(user_id=(select auth.uid()) or private.has_permission('wallet.view'));
drop policy if exists wallet_transactions_read_own_or_permitted on public.wallet_transactions;
create policy wallet_transactions_read_own_or_permitted on public.wallet_transactions for select to authenticated using(user_id=(select auth.uid()) or private.has_permission('transactions.view'));
drop policy if exists rooms_read_active_or_staff on public.rooms;
create policy rooms_read_active_or_staff on public.rooms for select to authenticated using(status<>'closed' or private.has_permission('rooms.view'));
drop policy if exists rooms_owner_or_staff_update on public.rooms;
create policy rooms_owner_or_staff_update on public.rooms for update to authenticated using(owner_id=(select auth.uid()) or private.has_permission('rooms.manage')) with check(owner_id=(select auth.uid()) or private.has_permission('rooms.manage'));
drop policy if exists room_seats_read_authenticated on public.room_seats;
create policy room_seats_read_authenticated on public.room_seats for select to authenticated using(true);
drop policy if exists room_members_read_authenticated on public.room_members;
create policy room_members_read_authenticated on public.room_members for select to authenticated using(true);
drop policy if exists room_bans_read_self_or_staff on public.room_bans;
create policy room_bans_read_self_or_staff on public.room_bans for select to authenticated using(user_id=(select auth.uid()) or private.has_permission('rooms.ban'));
drop policy if exists room_requests_read_participants on public.room_requests;
create policy room_requests_read_participants on public.room_requests for select to authenticated using(user_id=(select auth.uid()) or private.has_permission('rooms.manage') or exists(select 1 from public.rooms r where r.id=room_id and r.owner_id=(select auth.uid())));
drop policy if exists conversations_members_read on public.conversations;
create policy conversations_members_read on public.conversations for select to authenticated using(exists(select 1 from public.conversation_members cm where cm.conversation_id=id and cm.user_id=(select auth.uid())) or private.has_permission('messages.view'));
drop policy if exists conversation_members_read_self_or_staff on public.conversation_members;
create policy conversation_members_read_self_or_staff on public.conversation_members for select to authenticated using(user_id=(select auth.uid()) or exists(select 1 from public.conversation_members mine where mine.conversation_id=conversation_id and mine.user_id=(select auth.uid())) or private.has_permission('messages.view'));
drop policy if exists messages_read_member_or_staff on public.messages;
create policy messages_read_member_or_staff on public.messages for select to authenticated using(exists(select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=(select auth.uid())) or private.has_permission('messages.view'));
drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages for insert to authenticated with check(sender_id=(select auth.uid()) and exists(select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=(select auth.uid())));
drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages for update to authenticated using(sender_id=(select auth.uid())) with check(sender_id=(select auth.uid()));
drop policy if exists banners_read_active on public.banners;
create policy banners_read_active on public.banners for select to authenticated using((is_active and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now())) or private.has_permission('banners.manage'));
drop policy if exists audit_logs_read_staff on public.audit_logs;
create policy audit_logs_read_staff on public.audit_logs for select to authenticated using(private.has_permission('audit_logs.view'));
drop policy if exists app_settings_read_authenticated on public.app_settings;
create policy app_settings_read_authenticated on public.app_settings for select to authenticated using(true);

revoke insert,update,delete on public.wallets,public.wallet_transactions,public.admin_user_roles,public.role_permissions,public.app_permissions,public.app_roles,public.room_seats,public.room_bans,public.banners,public.audit_logs,public.app_settings from anon,authenticated;
grant select on public.wallets,public.wallet_transactions,public.admin_user_roles,public.role_permissions,public.app_permissions,public.app_roles,public.room_seats,public.room_bans,public.banners,public.audit_logs,public.app_settings to authenticated;
grant select,insert,update on public.profiles,public.user_settings to authenticated;
grant select,insert,update,delete on public.rooms,public.room_members,public.room_requests,public.conversations,public.conversation_members,public.messages to authenticated;
