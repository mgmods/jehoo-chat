-- Scope room chat history to the current visit and harden room gifts.
alter table public.conversations
  add column if not exists room_id uuid references public.rooms(id) on delete cascade;
create unique index if not exists conversations_one_room_chat
  on public.conversations(room_id) where kind = 'room' and room_id is not null;

create or replace function private.jehoo_room_message_visible(
  p_conversation_id uuid, p_user_id uuid, p_created_at timestamptz
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where c.id = p_conversation_id and cm.user_id = p_user_id
      and (c.kind <> 'room' or p_created_at > cm.joined_at)
  );
$$;
revoke all on function private.jehoo_room_message_visible(uuid,uuid,timestamptz) from public, anon;
grant execute on function private.jehoo_room_message_visible(uuid,uuid,timestamptz) to authenticated;

drop policy if exists messages_read_member_or_staff on public.messages;
create policy messages_read_member_or_staff on public.messages
  for select to authenticated
  using (
    private.jehoo_room_message_visible(conversation_id, (select auth.uid()), created_at)
    or private.has_permission('messages.view')
  );

create or replace function public.jehoo_get_room_conversation(p_room_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_conversation_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  select * into v_room from public.rooms where id = p_room_id;
  if not found or v_room.status = 'closed' then raise exception 'ROOM_UNAVAILABLE' using errcode = 'P0002'; end if;
  if exists (
    select 1 from public.room_bans b where b.room_id = p_room_id and b.user_id = v_user
      and (b.expires_at is null or b.expires_at > now())
  ) then raise exception 'ROOM_BANNED' using errcode = '42501'; end if;
  if not (
    v_room.owner_id = v_user
    or exists(select 1 from public.room_members rm where rm.room_id = p_room_id and rm.user_id = v_user)
    or exists(select 1 from public.room_seats rs where rs.room_id = p_room_id and rs.user_id = v_user and rs.status = 'occupied')
  ) then raise exception 'ROOM_MEMBERSHIP_REQUIRED' using errcode = '42501'; end if;

  insert into public.conversations(kind,title,created_by,room_id)
  values('room',v_room.name,v_user,p_room_id)
  on conflict (room_id) where kind = 'room' and room_id is not null do nothing;
  select id into v_conversation_id from public.conversations where room_id = p_room_id and kind = 'room' limit 1;
  insert into public.conversation_members(conversation_id,user_id,member_role,joined_at)
  values(v_conversation_id,v_user,'member',clock_timestamp())
  on conflict(conversation_id,user_id) do update set joined_at = clock_timestamp();
  return v_conversation_id;
end;
$$;
revoke all on function public.jehoo_get_room_conversation(uuid) from public, anon;
grant execute on function public.jehoo_get_room_conversation(uuid) to authenticated;

create table if not exists public.room_gift_catalog (
  gift_key text primary key,
  title text not null,
  emoji text not null default '🎁',
  price bigint not null check(price > 0),
  is_active boolean not null default true
);
insert into public.room_gift_catalog(gift_key,title,emoji,price,is_active) values
  ('rose','وردة','🌹',10,true),
  ('coffee','قهوة','☕',25,true),
  ('heart','قلب','💖',50,true),
  ('crown','تاج','👑',100,true),
  ('rocket','صاروخ','🚀',250,true)
on conflict(gift_key) do nothing;

create table if not exists public.room_gifts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  gift_key text not null references public.room_gift_catalog(gift_key),
  amount bigint not null check(amount > 0),
  idempotency_key text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists room_gifts_sender_id_idempotency_key_key
  on public.room_gifts(sender_id,idempotency_key);
create index if not exists room_gifts_room_created_idx on public.room_gifts(room_id,created_at desc);
alter table public.room_gift_catalog enable row level security;
alter table public.room_gifts enable row level security;
drop policy if exists room_gift_catalog_read_active on public.room_gift_catalog;
create policy room_gift_catalog_read_active on public.room_gift_catalog
  for select to authenticated using (is_active or private.has_permission('gifts.manage'));
drop policy if exists room_gifts_read_participants on public.room_gifts;
drop policy if exists room_gifts_read_room_members on public.room_gifts;
create policy room_gifts_read_room_members on public.room_gifts
  for select to authenticated using (
    sender_id = (select auth.uid()) or recipient_id = (select auth.uid())
    or exists(select 1 from public.room_members rm where rm.room_id = room_gifts.room_id and rm.user_id = (select auth.uid()))
    or exists(select 1 from public.rooms r where r.id = room_gifts.room_id and r.owner_id = (select auth.uid()))
  );
revoke all on public.room_gift_catalog, public.room_gifts from anon, authenticated;
grant select on public.room_gift_catalog, public.room_gifts to authenticated;

create or replace function public.jehoo_send_room_gift(
  p_room_id uuid, p_recipient_id uuid, p_gift_key text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_gift public.room_gift_catalog%rowtype;
  v_gift_id uuid;
  v_conversation uuid;
  v_sender_balance bigint;
  v_recipient_balance bigint;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_recipient_id is null or p_recipient_id = v_user then raise exception 'INVALID_RECIPIENT' using errcode = '22023'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 160 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status = 'closed' then raise exception 'ROOM_UNAVAILABLE' using errcode = 'P0002'; end if;
  if exists(select 1 from public.room_bans b where b.room_id = p_room_id and b.user_id = v_user and (b.expires_at is null or b.expires_at > now())) then
    raise exception 'ROOM_BANNED' using errcode = '42501';
  end if;
  if not (
    v_room.owner_id = v_user
    or exists(select 1 from public.room_members rm where rm.room_id = p_room_id and rm.user_id = v_user)
    or exists(select 1 from public.room_seats rs where rs.room_id = p_room_id and rs.user_id = v_user and rs.status = 'occupied')
  ) then raise exception 'SENDER_NOT_IN_ROOM' using errcode = '42501'; end if;
  if not (
    v_room.owner_id = p_recipient_id
    or exists(select 1 from public.room_members rm where rm.room_id = p_room_id and rm.user_id = p_recipient_id)
    or exists(select 1 from public.room_seats rs where rs.room_id = p_room_id and rs.user_id = p_recipient_id and rs.status = 'occupied')
  ) then raise exception 'RECIPIENT_NOT_IN_ROOM' using errcode = 'P0001'; end if;
  select * into v_gift from public.room_gift_catalog where gift_key = p_gift_key and is_active = true;
  if not found then raise exception 'GIFT_NOT_AVAILABLE' using errcode = 'P0002'; end if;

  insert into public.room_gifts(room_id,sender_id,recipient_id,gift_key,amount,idempotency_key)
  values(p_room_id,v_user,p_recipient_id,v_gift.gift_key,v_gift.price,p_idempotency_key)
  on conflict(sender_id,idempotency_key) do nothing
  returning id into v_gift_id;
  if v_gift_id is null then
    select id into v_gift_id from public.room_gifts where sender_id = v_user and idempotency_key = p_idempotency_key;
    return jsonb_build_object('duplicate',true,'gift_id',v_gift_id);
  end if;

  insert into public.wallets(user_id,coins) values(v_user,0) on conflict(user_id) do nothing;
  insert into public.wallets(user_id,coins) values(p_recipient_id,0) on conflict(user_id) do nothing;
  perform 1 from public.wallets where user_id in (v_user,p_recipient_id) order by user_id for update;
  update public.wallets set coins = coins - v_gift.price, updated_at = now()
    where user_id = v_user and coins >= v_gift.price returning coins into v_sender_balance;
  if not found then raise exception 'INSUFFICIENT_COINS' using errcode = 'P0001'; end if;
  update public.wallets set coins = coins + v_gift.price, updated_at = now()
    where user_id = p_recipient_id returning coins into v_recipient_balance;
  if not found then raise exception 'RECIPIENT_WALLET_NOT_FOUND' using errcode = 'P0001'; end if;

  insert into public.wallet_transactions(user_id,amount,balance_after,kind,status,idempotency_key,reference_id,metadata)
  values
    (v_user,-v_gift.price,v_sender_balance,'gift_sent','completed','gift-sent:'||v_gift_id::text,v_gift_id,
      jsonb_build_object('room_id',p_room_id,'recipient_id',p_recipient_id,'gift_key',v_gift.gift_key)),
    (p_recipient_id,v_gift.price,v_recipient_balance,'gift_received','completed','gift-received:'||v_gift_id::text,v_gift_id,
      jsonb_build_object('room_id',p_room_id,'sender_id',v_user,'gift_key',v_gift.gift_key));

  select id into v_conversation from public.conversations where room_id = p_room_id and kind = 'room' limit 1;
  if v_conversation is null then
    v_conversation := public.jehoo_get_room_conversation(p_room_id);
  end if;
  insert into public.messages(conversation_id,sender_id,message_type,body)
  values(v_conversation,v_user,'gift',v_gift.emoji||' أرسل '||v_gift.title||' إلى '||
    coalesce((select display_name from public.profiles where id = p_recipient_id),'عضو'));

  return jsonb_build_object('duplicate',false,'gift_id',v_gift_id,'price',v_gift.price,'sender_balance',v_sender_balance);
end;
$$;
revoke all on function public.jehoo_send_room_gift(uuid,uuid,text,text) from public, anon;
grant execute on function public.jehoo_send_room_gift(uuid,uuid,text,text) to authenticated;
