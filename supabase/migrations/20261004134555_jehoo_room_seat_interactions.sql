create or replace function public.jehoo_take_room_seat(p_room_id uuid,p_seat_number integer) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_user uuid:=auth.uid(); v_room public.rooms%rowtype; v_old integer; v_status text;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_seat_number<1 or p_seat_number>20 then raise exception 'Invalid seat' using errcode='22023'; end if;
 select * into v_room from public.rooms where id=p_room_id for update;
 if not found or v_room.status='closed' then raise exception 'Room unavailable' using errcode='P0002'; end if;
 if v_room.password_enabled and not exists(select 1 from public.room_members m where m.room_id=p_room_id and m.user_id=v_user) then raise exception 'Join the room first' using errcode='42501'; end if;
 if p_seat_number>v_room.max_seats then raise exception 'Seat is unavailable' using errcode='42501'; end if;
 select status into v_status from public.room_seats where room_id=p_room_id and seat_number=p_seat_number for update;
 if v_status is null then raise exception 'Seat not found' using errcode='P0002'; end if;
 if v_status='locked' then raise exception 'Seat is locked' using errcode='42501'; end if;
 if exists(select 1 from public.room_seats where room_id=p_room_id and seat_number=p_seat_number and user_id is not null and user_id<>v_user) then raise exception 'Seat is occupied' using errcode='42501'; end if;
 select seat_number into v_old from public.room_seats where room_id=p_room_id and user_id=v_user and status='occupied' limit 1;
 if v_old is not null and v_old<>p_seat_number then update public.room_seats set status='empty',user_id=null,reserved_for=null,updated_at=now() where room_id=p_room_id and seat_number=v_old; end if;
 update public.room_seats set status='occupied',user_id=v_user,reserved_for=null,updated_at=now() where room_id=p_room_id and seat_number=p_seat_number;
 insert into public.room_members(room_id,user_id,room_role,muted,joined_at) values(p_room_id,v_user,case when v_room.owner_id=v_user then 'host' else 'listener' end,false,now()) on conflict(room_id,user_id) do update set joined_at=now();
 return jsonb_build_object('seatNumber',p_seat_number);
end;$function$;
create or replace function public.jehoo_set_room_seat_lock(p_room_id uuid,p_seat_number integer,p_locked boolean) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_user uuid:=auth.uid(); v_room public.rooms%rowtype; v_role text;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select * into v_room from public.rooms where id=p_room_id for update;
 if not found then raise exception 'Room not found' using errcode='P0002'; end if;
 select case when v_room.owner_id=v_user then 'host' else m.room_role end into v_role from public.room_members m where m.room_id=p_room_id and m.user_id=v_user;
 if v_room.owner_id<>v_user and coalesce(v_role,'') not in ('co_host','moderator') then raise exception 'ROOM_MANAGE_REQUIRED' using errcode='42501'; end if;
 if p_seat_number<1 or p_seat_number>v_room.max_seats then raise exception 'Invalid seat' using errcode='22023'; end if;
 if p_locked then update public.room_seats set status='locked',user_id=null,reserved_for=null,updated_at=now() where room_id=p_room_id and seat_number=p_seat_number;
 else update public.room_seats set status='empty',updated_at=now() where room_id=p_room_id and seat_number=p_seat_number and user_id is null; end if;
 return jsonb_build_object('seatNumber',p_seat_number,'locked',p_locked);
end;$function$;