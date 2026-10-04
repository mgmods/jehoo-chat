create or replace function public.jehoo_request_seat(p_room_id uuid,p_seat_number integer)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare
  v_user uuid:=auth.uid();
  v_room public.rooms%rowtype;
  v_member public.room_members%rowtype;
  v_seat public.room_seats%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  select * into v_room from public.rooms where id=p_room_id for update;
  if not found or v_room.status='closed' then raise exception 'ROOM_UNAVAILABLE' using errcode='P0001'; end if;
  if p_seat_number < 1 or p_seat_number > least(coalesce(v_room.max_seats,10),10) then raise exception 'SEAT_NOT_AVAILABLE' using errcode='P0001'; end if;
  select * into v_member from public.room_members where room_id=p_room_id and user_id=v_user;
  if not found then raise exception 'ROOM_MEMBERSHIP_REQUIRED' using errcode='42501'; end if;
  if v_room.status='locked' and v_room.owner_id is distinct from v_user and coalesce(v_member.room_role,'') not in ('co_host','moderator') then raise exception 'ROOM_LOCKED' using errcode='42501'; end if;
  if exists(select 1 from public.room_bans where room_id=p_room_id and user_id=v_user and (expires_at is null or expires_at>now())) then raise exception 'ROOM_BANNED' using errcode='42501'; end if;
  if exists(select 1 from public.room_seats where room_id=p_room_id and user_id=v_user and status='occupied' and seat_number<>p_seat_number) then raise exception 'ALREADY_SEATED' using errcode='P0001'; end if;
  select * into v_seat from public.room_seats where room_id=p_room_id and seat_number=p_seat_number for update;
  if not found or v_seat.status<>'empty' or v_seat.user_id is not null then raise exception 'SEAT_OCCUPIED' using errcode='P0001'; end if;
  update public.room_seats set status='occupied',user_id=v_user,reserved_for=null,updated_at=now() where room_id=p_room_id and seat_number=p_seat_number and status='empty' and user_id is null;
  if not found then raise exception 'SEAT_OCCUPIED' using errcode='P0001'; end if;
  return jsonb_build_object('room_id',p_room_id,'seat_number',p_seat_number);
end $$;
revoke execute on function public.jehoo_request_seat(uuid,integer) from anon;
revoke execute on function public.jehoo_set_room_seat_lock(uuid,integer,boolean) from anon;
revoke execute on function public.jehoo_set_seat_lock(uuid,integer,boolean) from anon;
revoke execute on function public.jehoo_take_room_seat(uuid,integer) from anon;
revoke execute on function public.jehoo_update_room_settings(uuid,text,text,text,integer,boolean,text,text) from anon;
grant execute on function public.jehoo_request_seat(uuid,integer) to authenticated;