-- Harden direct client writes to sensitive columns and state transitions.
-- Room seat occupancy/roles and staff permissions are backend-managed.
revoke insert, update on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update(display_name, bio, country, avatar_url, locale, status) on public.profiles to authenticated;

revoke insert, update, delete on public.room_members, public.room_requests, public.room_seats, public.room_bans from anon, authenticated;
grant select on public.room_members, public.room_requests, public.room_seats, public.room_bans to authenticated;

revoke insert, update, delete on public.admin_user_roles, public.role_permissions, public.app_permissions, public.app_roles from anon, authenticated;

revoke insert, update, delete on public.rooms from anon, authenticated;
grant select on public.rooms to authenticated;
grant insert(owner_id, name, description, cover_url, livekit_room_name) on public.rooms to authenticated;
grant update(name, description, cover_url, status) on public.rooms to authenticated;
