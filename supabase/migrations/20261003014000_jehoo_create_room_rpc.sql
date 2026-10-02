create or replace function private.jehoo_create_room(p_name text, p_description text default '')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_livekit_name text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'Room name must be between 2 and 80 characters' using errcode = '22023'; end if;
  if char_length(v_description) > 500 then raise exception 'Room description must be 500 characters or less' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id) then raise exception 'Profile not found; please sign in again' using errcode = '23503'; end if;
  v_room_id := gen_random_uuid();
  v_livekit_name := 'jehoo-' || replace(v_room_id::text, '-', '');
  insert into public.rooms (id, owner_id, name, description, status, max_seats, livekit_room_name)
  values (v_room_id, v_user_id, v_name, v_description, 'active', 20, v_livekit_name);
  insert into public.room_seats (room_id, seat_number, status)
  select v_room_id, n, 'empty' from generate_series(1,20) as n
  on conflict (room_id, seat_number) do nothing;
  update public.room_seats set status = 'occupied', user_id = v_user_id, reserved_for = null, updated_at = now()
   where room_id = v_room_id and seat_number = 1;
  insert into public.room_members (room_id, user_id, room_role, muted)
  values (v_room_id, v_user_id, 'host', false)
  on conflict (room_id, user_id) do update set room_role = 'host', muted = false;
  return jsonb_build_object('id', v_room_id, 'name', v_name, 'livekit_room_name', v_livekit_name);
end;
$$;
grant execute on function private.jehoo_create_room(text, text) to authenticated;
create or replace function public.jehoo_create_room(p_name text, p_description text default '')
returns jsonb language sql security invoker set search_path = ''
as $$ select private.jehoo_create_room(p_name, p_description); $$;
revoke all on function public.jehoo_create_room(text, text) from public, anon;
grant execute on function public.jehoo_create_room(text, text) to authenticated;
