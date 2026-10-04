create or replace function private.jehoo_room_can_manage(p_room_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.rooms r where r.id=p_room_id and r.owner_id=p_user_id)
  or exists (select 1 from public.room_members m where m.room_id=p_room_id and m.user_id=p_user_id and m.room_role in ('host','co_host','moderator'));
$$;

create or replace function public.jehoo_set_room_role(p_room_id uuid,p_target_user_id uuid,p_role text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare uid uuid:=auth.uid(); owner_id uuid; actor_role text;
begin
 if uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_role not in ('listener','speaker','moderator','co_host') then raise exception 'Invalid room role' using errcode='22023'; end if;
 select r.owner_id into owner_id from public.rooms r where r.id=p_room_id;
 if owner_id is null then raise exception 'Room unavailable' using errcode='P0002'; end if;
 select m.room_role into actor_role from public.room_members m where m.room_id=p_room_id and m.user_id=uid;
 if uid<>owner_id or p_target_user_id=owner_id then
   if uid<>owner_id then raise exception 'Only owner can appoint room admins' using errcode='42501'; end if;
   if p_target_user_id=owner_id then raise exception 'Owner role cannot be changed' using errcode='42501'; end if;
 end if;
 if p_role in ('moderator','co_host') and uid<>owner_id then raise exception 'Only owner can appoint room admins' using errcode='42501'; end if;
 update public.room_members set room_role=p_role where room_id=p_room_id and user_id=p_target_user_id;
 if not found then insert into public.room_members(room_id,user_id,room_role) values(p_room_id,p_target_user_id,p_role); end if;
 return jsonb_build_object('updated',true,'role',p_role);
end;
$$;

create or replace function public.jehoo_kick_from_room(p_room_id uuid,p_target_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare uid uuid:=auth.uid(); owner_id uuid; actor_role text; target_role text;
begin
 if uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select owner_id into owner_id from public.rooms where id=p_room_id;
 select room_role into actor_role from public.room_members where room_id=p_room_id and user_id=uid;
 select room_role into target_role from public.room_members where room_id=p_room_id and user_id=p_target_user_id;
 if owner_id is null then raise exception 'Room unavailable' using errcode='P0002'; end if;
 if uid<>owner_id and coalesce(actor_role,'') not in ('co_host','moderator') then raise exception 'Not allowed' using errcode='42501'; end if;
 if p_target_user_id=owner_id or (target_role in ('host','co_host','moderator') and uid<>owner_id) then raise exception 'Cannot remove this member' using errcode='42501'; end if;
 update public.room_seats set status='empty',user_id=null,reserved_for=null,updated_at=now() where room_id=p_room_id and user_id=p_target_user_id and status='occupied';
 delete from public.room_members where room_id=p_room_id and user_id=p_target_user_id;
 update public.room_requests set status='cancelled',handled_by=uid,handled_at=now() where room_id=p_room_id and user_id=p_target_user_id and status='pending';
 return jsonb_build_object('kicked',true);
end;
$$;

create or replace function public.jehoo_lower_from_seat(p_room_id uuid,p_target_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare uid uuid:=auth.uid(); owner_id uuid; actor_role text; target_role text;
begin
 if uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select owner_id into owner_id from public.rooms where id=p_room_id;
 select room_role into actor_role from public.room_members where room_id=p_room_id and user_id=uid;
 select room_role into target_role from public.room_members where room_id=p_room_id and user_id=p_target_user_id;
 if owner_id is null then raise exception 'Room unavailable' using errcode='P0002'; end if;
 if uid<>owner_id and coalesce(actor_role,'') not in ('co_host','moderator') then raise exception 'Not allowed' using errcode='42501'; end if;
 if p_target_user_id=owner_id or (target_role in ('host','co_host','moderator') and uid<>owner_id) then raise exception 'Cannot lower this member' using errcode='42501'; end if;
 update public.room_seats set status='empty',user_id=null,reserved_for=null,updated_at=now() where room_id=p_room_id and user_id=p_target_user_id and status='occupied';
 update public.room_members set room_role='listener',muted=true where room_id=p_room_id and user_id=p_target_user_id;
 return jsonb_build_object('lowered',true);
end;
$$;

create or replace function public.jehoo_mute_room_member(p_room_id uuid,p_target_user_id uuid,p_muted boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare uid uuid:=auth.uid(); owner_id uuid; actor_role text; target_role text;
begin
 if uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select owner_id into owner_id from public.rooms where id=p_room_id;
 select room_role into actor_role from public.room_members where room_id=p_room_id and user_id=uid;
 select room_role into target_role from public.room_members where room_id=p_room_id and user_id=p_target_user_id;
 if owner_id is null then raise exception 'Room unavailable' using errcode='P0002'; end if;
 if uid<>owner_id and coalesce(actor_role,'') not in ('co_host','moderator') then raise exception 'Not allowed' using errcode='42501'; end if;
 if p_target_user_id=owner_id or (target_role in ('host','co_host','moderator') and uid<>owner_id) then raise exception 'Cannot mute this member' using errcode='42501'; end if;
 update public.room_members set muted=p_muted where room_id=p_room_id and user_id=p_target_user_id;
 return jsonb_build_object('muted',p_muted);
end;
$$;

create or replace function public.jehoo_ban_from_room(p_room_id uuid,p_target_user_id uuid,p_reason text default '')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare uid uuid:=auth.uid(); owner_id uuid; actor_role text; target_role text;
begin
 if uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select owner_id into owner_id from public.rooms where id=p_room_id;
 select room_role into actor_role from public.room_members where room_id=p_room_id and user_id=uid;
 select room_role into target_role from public.room_members where room_id=p_room_id and user_id=p_target_user_id;
 if owner_id is null then raise exception 'Room unavailable' using errcode='P0002'; end if;
 if uid<>owner_id and coalesce(actor_role,'') not in ('co_host','moderator') then raise exception 'Not allowed' using errcode='42501'; end if;
 if p_target_user_id=owner_id or (target_role in ('host','co_host','moderator') and uid<>owner_id) then raise exception 'Cannot ban this member' using errcode='42501'; end if;
 insert into public.room_bans(room_id,user_id,banned_by,reason) values(p_room_id,p_target_user_id,uid,coalesce(p_reason,'')) on conflict (room_id,user_id) do update set banned_by=excluded.banned_by,reason=excluded.reason,expires_at=null,created_at=now();
 update public.room_seats set status='empty',user_id=null,reserved_for=null,updated_at=now() where room_id=p_room_id and user_id=p_target_user_id;
 delete from public.room_members where room_id=p_room_id and user_id=p_target_user_id;
 return jsonb_build_object('banned',true);
end;
$$;

grant execute on function public.jehoo_set_room_role(uuid,uuid,text) to authenticated;
grant execute on function public.jehoo_kick_from_room(uuid,uuid) to authenticated;
grant execute on function public.jehoo_lower_from_seat(uuid,uuid) to authenticated;
grant execute on function public.jehoo_mute_room_member(uuid,uuid,boolean) to authenticated;
grant execute on function public.jehoo_ban_from_room(uuid,uuid,text) to authenticated;