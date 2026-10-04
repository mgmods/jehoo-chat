-- Leaving a room must revoke this user's room-chat session immediately.
create or replace function private.jehoo_leave_room(p_room_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select owner_id into v_owner from public.rooms where id = p_room_id;
  if not found then raise exception 'Room unavailable' using errcode = 'P0002'; end if;

  update public.room_seats set status = 'empty', user_id = null, updated_at = now()
    where room_id = p_room_id and user_id = v_user and status = 'occupied';
  if v_owner is distinct from v_user then
    delete from public.room_members where room_id = p_room_id and user_id = v_user;
  end if;
  delete from public.conversation_members cm
    using public.conversations c
    where cm.conversation_id = c.id and c.kind = 'room'
      and c.room_id = p_room_id and cm.user_id = v_user;
  update public.room_requests set status = 'cancelled', handled_at = now()
    where room_id = p_room_id and user_id = v_user and status = 'pending';
  return jsonb_build_object('left', true);
end;
$$;
revoke all on function private.jehoo_leave_room(uuid) from public, anon;
grant execute on function private.jehoo_leave_room(uuid) to authenticated;
