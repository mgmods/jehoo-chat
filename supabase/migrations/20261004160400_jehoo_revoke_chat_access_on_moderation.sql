-- Kicking or banning a user must revoke room-chat access in the same database transaction.
create or replace function private.jehoo_kick_from_room(p_room_id uuid, p_target_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  owner_id uuid;
  actor_role text;
  target_role text;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select r.owner_id into owner_id from public.rooms r where r.id = p_room_id;
  if owner_id is null then raise exception 'Room unavailable' using errcode = 'P0002'; end if;
  select rm.room_role into actor_role from public.room_members rm where rm.room_id = p_room_id and rm.user_id = uid;
  select rm.room_role into target_role from public.room_members rm where rm.room_id = p_room_id and rm.user_id = p_target_user_id;
  if uid <> owner_id and coalesce(actor_role, '') not in ('co_host', 'moderator') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_target_user_id = owner_id or (target_role in ('host', 'co_host', 'moderator') and uid <> owner_id) then
    raise exception 'Cannot remove this member' using errcode = '42501';
  end if;
  update public.room_seats set status = 'empty', user_id = null, reserved_for = null, updated_at = now()
    where room_id = p_room_id and user_id = p_target_user_id and status = 'occupied';
  delete from public.room_members where room_id = p_room_id and user_id = p_target_user_id;
  delete from public.conversation_members cm using public.conversations c
    where cm.conversation_id = c.id and c.kind = 'room' and c.room_id = p_room_id and cm.user_id = p_target_user_id;
  update public.room_requests set status = 'cancelled', handled_by = uid, handled_at = now()
    where room_id = p_room_id and user_id = p_target_user_id and status = 'pending';
  return jsonb_build_object('kicked', true);
end;
$$;

create or replace function private.jehoo_ban_from_room(p_room_id uuid, p_target_user_id uuid, p_reason text default '')
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  owner_id uuid;
  actor_role text;
  target_role text;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select r.owner_id into owner_id from public.rooms r where r.id = p_room_id;
  select rm.room_role into actor_role from public.room_members rm where rm.room_id = p_room_id and rm.user_id = uid;
  select rm.room_role into target_role from public.room_members rm where rm.room_id = p_room_id and rm.user_id = p_target_user_id;
  if owner_id is null then raise exception 'Room unavailable' using errcode = 'P0002'; end if;
  if uid <> owner_id and coalesce(actor_role, '') not in ('co_host', 'moderator') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_target_user_id = owner_id or (target_role in ('host', 'co_host', 'moderator') and uid <> owner_id) then
    raise exception 'Cannot ban this member' using errcode = '42501';
  end if;
  insert into public.room_bans(room_id, user_id, banned_by, reason)
  values(p_room_id, p_target_user_id, uid, coalesce(p_reason, ''))
  on conflict (room_id, user_id) do update
    set banned_by = excluded.banned_by, reason = excluded.reason, expires_at = null, created_at = now();
  update public.room_seats set status = 'empty', user_id = null, reserved_for = null, updated_at = now()
    where room_id = p_room_id and user_id = p_target_user_id;
  delete from public.room_members where room_id = p_room_id and user_id = p_target_user_id;
  delete from public.conversation_members cm using public.conversations c
    where cm.conversation_id = c.id and c.kind = 'room' and c.room_id = p_room_id and cm.user_id = p_target_user_id;
  return jsonb_build_object('banned', true);
end;
$$;
