alter table public.rooms add column if not exists password_enabled boolean not null default false, add column if not exists password_hash text, add column if not exists welcome_message text not null default 'مرحباً بكم. يرجى احترام بعضكم البعض. يمنع المحتوى الإباحي أو السياسي.';
alter table public.rooms drop constraint if exists rooms_max_seats_check;
alter table public.rooms add constraint rooms_max_seats_check check (max_seats between 1 and 20);
update public.rooms set max_seats=10 where max_seats>10;
drop function if exists public.jehoo_join_room(uuid);
drop function if exists private.jehoo_join_room(uuid);
create or replace function private.jehoo_join_room(p_room_id uuid,p_password text default null) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_user uuid:=auth.uid(); v_room public.rooms%rowtype; v_role text; v_seat integer; v_ban public.room_bans%rowtype;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select * into v_room from public.rooms where id=p_room_id for update;
 if not found or v_room.status='closed' then raise exception 'Room unavailable' using errcode='P0002'; end if;
 if v_room.password_enabled and (coalesce(btrim(p_password),'')='' or v_room.password_hash is null or extensions.crypt(p_password,v_room.password_hash)<>v_room.password_hash) then raise exception 'ROOM_PASSWORD_REQUIRED' using errcode='42501'; end if;
 select * into v_ban from public.room_bans b where b.room_id=p_room_id and b.user_id=v_user;
 if found and (v_ban.expires_at is null or v_ban.expires_at>now()) then raise exception 'You are banned from this room' using errcode='42501'; end if;
 v_role:=case when v_room.owner_id=v_user then 'host' else null end;
 if v_role is null then select m.room_role into v_role from public.room_members m where m.room_id=p_room_id and m.user_id=v_user; end if;
 if v_room.status='locked' and coalesce(v_role,'listener') not in ('host','co_host','moderator') then raise exception 'Room is locked' using errcode='42501'; end if;
 if v_role is null then v_role:='listener'; end if;
 select s.seat_number into v_seat from public.room_seats s where s.room_id=p_room_id and s.user_id=v_user and s.status='occupied' limit 1;
 if v_seat is null then
  select s.seat_number into v_seat from public.room_seats s where s.room_id=p_room_id and s.seat_number<=v_room.max_seats and (s.status='empty' or (s.status='reserved' and s.reserved_for=v_user)) order by case when s.seat_number=1 and v_room.owner_id=v_user then 0 else 1 end,s.seat_number for update skip locked limit 1;
  if v_seat is null then raise exception 'No available seats' using errcode='P0001'; end if;
  update public.room_seats set status='occupied',user_id=v_user,reserved_for=null,updated_at=now() where room_id=p_room_id and seat_number=v_seat;
 end if;
 insert into public.room_members(room_id,user_id,room_role,muted,joined_at) values(p_room_id,v_user,v_role,false,now()) on conflict(room_id,user_id) do update set joined_at=now();
 return jsonb_build_object('roomId',p_room_id,'seatNumber',v_seat,'role',v_role);
end;$function$;
create or replace function public.jehoo_join_room(p_room_id uuid,p_password text default null) returns jsonb language sql set search_path to '' as $function$ select private.jehoo_join_room(p_room_id,p_password); $function$;
create or replace function public.jehoo_update_room_settings(p_room_id uuid,p_name text default null,p_description text default null,p_cover_url text default null,p_max_seats integer default null,p_password_enabled boolean default null,p_password text default null,p_welcome_message text default null) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_user uuid:=auth.uid(); v_room public.rooms%rowtype; v_can_manage boolean:=false;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select * into v_room from public.rooms where id=p_room_id for update;
 if not found then raise exception 'Room not found' using errcode='P0002'; end if;
 v_can_manage:=v_room.owner_id=v_user or exists(select 1 from public.room_members m where m.room_id=p_room_id and m.user_id=v_user and m.room_role in ('co_host','moderator'));
 if not v_can_manage then raise exception 'ROOM_MANAGE_REQUIRED' using errcode='42501'; end if;
 if p_name is not null and (char_length(btrim(p_name))<1 or char_length(btrim(p_name))>80) then raise exception 'Invalid room name' using errcode='22023'; end if;
 if p_description is not null and char_length(p_description)>500 then raise exception 'Description too long' using errcode='22023'; end if;
 if p_max_seats is not null and (p_max_seats<1 or p_max_seats>20) then raise exception 'Seats must be between 1 and 20' using errcode='22023'; end if;
 if p_password_enabled=true and char_length(coalesce(btrim(p_password),''))<4 and v_room.password_enabled=false then raise exception 'Password must be at least 4 characters' using errcode='22023'; end if;
 update public.rooms set name=coalesce(nullif(btrim(p_name),''),name),description=coalesce(p_description,description),cover_url=coalesce(p_cover_url,cover_url),max_seats=coalesce(p_max_seats,max_seats),password_enabled=coalesce(p_password_enabled,password_enabled),password_hash=case when p_password_enabled=false then null when p_password_enabled=true and btrim(coalesce(p_password,''))<>'' then extensions.crypt(btrim(p_password),extensions.gen_salt('bf',10)) else password_hash end,welcome_message=coalesce(p_welcome_message,welcome_message),updated_at=now() where id=p_room_id returning * into v_room;
 return jsonb_build_object('id',v_room.id,'name',v_room.name,'description',v_room.description,'cover_url',v_room.cover_url,'max_seats',v_room.max_seats,'password_enabled',v_room.password_enabled,'welcome_message',v_room.welcome_message);
end;$function$;