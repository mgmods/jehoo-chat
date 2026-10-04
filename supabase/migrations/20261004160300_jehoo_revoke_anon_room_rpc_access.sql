-- These room RPCs must never be callable by anonymous clients via PUBLIC grants.
revoke all on function public.jehoo_request_seat(uuid,integer) from public, anon;
revoke all on function public.jehoo_set_room_seat_lock(uuid,integer,boolean) from public, anon;
revoke all on function public.jehoo_set_seat_lock(uuid,integer,boolean) from public, anon;
revoke all on function public.jehoo_take_room_seat(uuid,integer) from public, anon;
revoke all on function public.jehoo_update_room_settings(uuid,text,text,text,integer,boolean,text,text) from public, anon;

grant execute on function public.jehoo_request_seat(uuid,integer) to authenticated;
grant execute on function public.jehoo_set_room_seat_lock(uuid,integer,boolean) to authenticated;
grant execute on function public.jehoo_set_seat_lock(uuid,integer,boolean) to authenticated;
grant execute on function public.jehoo_take_room_seat(uuid,integer) to authenticated;
grant execute on function public.jehoo_update_room_settings(uuid,text,text,text,integer,boolean,text,text) to authenticated;
