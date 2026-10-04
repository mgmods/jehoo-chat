-- Room-conversation identity for room-scoped chat.
-- The session-aware RPC and RLS policy are finalized in
-- 20261004160000_jehoo_room_chat_sessions_and_gifts.sql.
alter table public.conversations
  add column if not exists room_id uuid references public.rooms(id) on delete cascade;
create unique index if not exists conversations_one_room_chat
  on public.conversations(room_id) where kind = 'room' and room_id is not null;
