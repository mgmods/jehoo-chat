create index if not exists room_requests_pending_microphone_idx
  on public.room_requests(room_id, created_at)
  where request_type='microphone' and status='pending';
create index if not exists room_requests_user_status_idx
  on public.room_requests(user_id, status);
create index if not exists room_members_user_id_idx on public.room_members(user_id);
create index if not exists room_seats_user_id_idx on public.room_seats(user_id) where user_id is not null;
create index if not exists room_seats_reserved_for_idx on public.room_seats(reserved_for) where reserved_for is not null;
create index if not exists room_bans_user_id_idx on public.room_bans(user_id);