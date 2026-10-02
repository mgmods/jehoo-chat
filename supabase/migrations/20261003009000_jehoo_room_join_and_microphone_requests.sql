create or replace function public.jehoo_join_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_role text; v_seat integer; v_ban public.room_bans%rowtype;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select * into v_room from public.rooms where id=p_room_id for update;
 if not found or v_room.status='closed' then raise exception 'Room unavailable' using errcode='P0002'; end if;
 select * into v_ban from public.room_bans b where b.room_id=p_room_id and b.user_id=v_user;
 if found and (v_ban.expires_at is null or v_ban.expires_at > now()) then raise exception 'You are banned from this room' using errcode='42501'; end if;
 v_role := case when v_room.owner_id=v_user then 'host' else null end;
 if v_role is null then select m.room_role into v_role from public.room_members m where m.room_id=p_room_id and m.user_id=v_user; end if;
 if v_room.status='locked' and coalesce(v_role,'listener') not in ('host','co_host','moderator') then raise exception 'Room is locked' using errcode='42501'; end if;
 if v_role is null then v_role := 'listener'; end if;
 select s.seat_number into v_seat from public.room_seats s where s.room_id=p_room_id and s.user_id=v_user and s.status='occupied' limit 1;
 if v_seat is null then
   select s.seat_number into v_seat from public.room_seats s where s.room_id=p_room_id and (s.status='empty' or (s.status='reserved' and s.reserved_for=v_user))
   order by case when s.seat_number=1 and v_room.owner_id=v_user then 0 else 1 end, s.seat_number for update skip locked limit 1;
   if v_seat is null then raise exception 'No available seats' using errcode='P0001'; end if;
   update public.room_seats set status='occupied',user_id=v_user,reserved_for=null,updated_at=now() where room_id=p_room_id and seat_number=v_seat;
 end if;
 insert into public.room_members(room_id,user_id,room_role,muted,joined_at) values(p_room_id,v_user,v_role,false,now())
 on conflict(room_id,user_id) do update set joined_at=now();
 return jsonb_build_object('roomId',p_room_id,'seatNumber',v_seat,'role',v_role);
end; $$;
create or replace function public.jehoo_leave_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_owner uuid;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select owner_id into v_owner from public.rooms where id=p_room_id;
 if not found then raise exception 'Room unavailable' using errcode='P0002'; end if;
 update public.room_seats set status='empty',user_id=null,updated_at=now() where room_id=p_room_id and user_id=v_user and status='occupied';
 if v_owner is distinct from v_user then delete from public.room_members where room_id=p_room_id and user_id=v_user; end if;
 update public.room_requests set status='cancelled',handled_at=now() where room_id=p_room_id and user_id=v_user and status='pending';
 return jsonb_build_object('left',true);
end; $$;
create or replace function public.jehoo_request_microphone(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_member public.room_members%rowtype; v_request uuid;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select * into v_room from public.rooms where id=p_room_id;
 if not found or v_room.status='closed' then raise exception 'Room unavailable' using errcode='P0002'; end if;
 select * into v_member from public.room_members where room_id=p_room_id and user_id=v_user;
 if not found then raise exception 'Join the room first' using errcode='42501'; end if;
 if v_member.room_role in ('host','co_host','moderator','speaker') then return jsonb_build_object('alreadySpeaker',true); end if;
 if exists(select 1 from public.room_requests where room_id=p_room_id and user_id=v_user and request_type='microphone' and status='pending') then raise exception 'Microphone request already pending' using errcode='23505'; end if;
 insert into public.room_requests(room_id,user_id,request_type,status) values(p_room_id,v_user,'microphone','pending') returning id into v_request;
 return jsonb_build_object('requestId',v_request,'status','pending');
end; $$;
create or replace function public.jehoo_handle_microphone_request(p_request_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_request public.room_requests%rowtype; v_room public.rooms%rowtype; v_role text; v_seat integer;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select * into v_request from public.room_requests where id=p_request_id and request_type='microphone' and status='pending' for update;
 if not found then raise exception 'Pending microphone request not found' using errcode='P0002'; end if;
 select * into v_room from public.rooms where id=v_request.room_id for update;
 if not found then raise exception 'Room unavailable' using errcode='P0002'; end if;
 if v_room.owner_id=v_actor then v_role := 'host'; else select room_role into v_role from public.room_members where room_id=v_room.id and user_id=v_actor; end if;
 if coalesce(v_role,'') not in ('host','co_host','moderator') then raise exception 'Not allowed to manage microphone requests' using errcode='42501'; end if;
 if p_accept then
   select seat_number into v_seat from public.room_seats where room_id=v_room.id and user_id=v_request.user_id and status='occupied' limit 1;
   if v_seat is null then
     select seat_number into v_seat from public.room_seats where room_id=v_room.id and status='empty' order by seat_number for update skip locked limit 1;
     if v_seat is null then raise exception 'No available seats' using errcode='P0001'; end if;
     update public.room_seats set status='occupied',user_id=v_request.user_id,updated_at=now() where room_id=v_room.id and seat_number=v_seat;
   end if;
   insert into public.room_members(room_id,user_id,room_role,muted,joined_at) values(v_room.id,v_request.user_id,'speaker',false,now())
   on conflict(room_id,user_id) do update set room_role='speaker',muted=false;
   update public.room_requests set status='accepted',handled_by=v_actor,handled_at=now() where id=p_request_id;
 else update public.room_requests set status='rejected',handled_by=v_actor,handled_at=now() where id=p_request_id;
 end if;
 return jsonb_build_object('requestId',p_request_id,'status',case when p_accept then 'accepted' else 'rejected' end);
end; $$;
revoke all on function public.jehoo_join_room(uuid) from public, anon;
revoke all on function public.jehoo_leave_room(uuid) from public, anon;
revoke all on function public.jehoo_request_microphone(uuid) from public, anon;
revoke all on function public.jehoo_handle_microphone_request(uuid,boolean) from public, anon;
grant execute on function public.jehoo_join_room(uuid) to authenticated;
grant execute on function public.jehoo_leave_room(uuid) to authenticated;
grant execute on function public.jehoo_request_microphone(uuid) to authenticated;
grant execute on function public.jehoo_handle_microphone_request(uuid,boolean) to authenticated;