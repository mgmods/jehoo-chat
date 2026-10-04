-- Joining a room should not require occupying one of its limited speaker seats.
-- Participants without a free seat can still listen, chat, and receive room gifts.
create or replace function private.jehoo_join_room(p_room_id uuid, p_password text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_role text;
  v_seat integer;
  v_ban public.room_bans%rowtype;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_room from public.rooms where id=p_room_id for update;
  if not found or v_room.status='closed' then raise exception 'Room unavailable' using errcode='P0002'; end if;
  if v_room.password_enabled and (coalesce(btrim(p_password),'')='' or v_room.password_hash is null or extensions.crypt(p_password,v_room.password_hash)<>v_room.password_hash) then
    raise exception 'ROOM_PASSWORD_REQUIRED' using errcode='42501';
  end if;
  select * into v_ban from public.room_bans b where b.room_id=p_room_id and b.user_id=v_user;
  if found and (v_ban.expires_at is null or v_ban.expires_at>now()) then raise exception 'You are banned from this room' using errcode='42501'; end if;

  v_role:=case when v_room.owner_id=v_user then 'host' else null end;
  if v_role is null then select m.room_role into v_role from public.room_members m where m.room_id=p_room_id and m.user_id=v_user; end if;
  if v_room.status='locked' and coalesce(v_role,'listener') not in ('host','co_host','moderator') then raise exception 'Room is locked' using errcode='42501'; end if;
  if v_role is null then v_role:='listener'; end if;

  select s.seat_number into v_seat from public.room_seats s
    where s.room_id=p_room_id and s.user_id=v_user and s.status='occupied' limit 1;
  if v_seat is null then
    select s.seat_number into v_seat from public.room_seats s
    where s.room_id=p_room_id and s.seat_number<=v_room.max_seats
      and (s.status='empty' or (s.status='reserved' and s.reserved_for=v_user))
    order by case when s.seat_number=1 and v_room.owner_id=v_user then 0 else 1 end,s.seat_number
    for update skip locked limit 1;
    if v_seat is not null then
      update public.room_seats set status='occupied',user_id=v_user,reserved_for=null,updated_at=now()
        where room_id=p_room_id and seat_number=v_seat;
    end if;
  end if;

  insert into public.room_members(room_id,user_id,room_role,muted,joined_at)
  values(p_room_id,v_user,v_role,false,now())
  on conflict(room_id,user_id) do update set joined_at=now();

  return jsonb_build_object('roomId',p_room_id,'seatNumber',v_seat,'role',v_role,'listeningOnly',v_seat is null);
end;
$$;
revoke all on function private.jehoo_join_room(uuid,text) from public, anon;
grant execute on function private.jehoo_join_room(uuid,text) to authenticated;
