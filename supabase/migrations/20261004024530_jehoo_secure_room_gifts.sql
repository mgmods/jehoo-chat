-- Durable room-gift catalog and transactional ledger records.
-- The final transactional RPC and participant-scoped policies are finalized in
-- 20261004160000_jehoo_room_chat_sessions_and_gifts.sql.
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
  ('crown','تاج','👑',100,true)
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
create index if not exists room_gifts_room_created_idx
  on public.room_gifts(room_id,created_at desc);
