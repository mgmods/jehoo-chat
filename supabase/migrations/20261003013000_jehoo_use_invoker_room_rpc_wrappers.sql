grant execute on function private.jehoo_join_room(uuid) to authenticated;
grant execute on function private.jehoo_leave_room(uuid) to authenticated;
grant execute on function private.jehoo_request_microphone(uuid) to authenticated;
grant execute on function private.jehoo_handle_microphone_request(uuid,boolean) to authenticated;

create or replace function public.jehoo_join_room(p_room_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.jehoo_join_room(p_room_id); $$;
create or replace function public.jehoo_leave_room(p_room_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.jehoo_leave_room(p_room_id); $$;
create or replace function public.jehoo_request_microphone(p_room_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.jehoo_request_microphone(p_room_id); $$;
create or replace function public.jehoo_handle_microphone_request(p_request_id uuid,p_accept boolean)
returns jsonb language sql security invoker set search_path=''
as $$ select private.jehoo_handle_microphone_request(p_request_id,p_accept); $$;

revoke all on function public.jehoo_join_room(uuid) from public, anon;
revoke all on function public.jehoo_leave_room(uuid) from public, anon;
revoke all on function public.jehoo_request_microphone(uuid) from public, anon;
revoke all on function public.jehoo_handle_microphone_request(uuid,boolean) from public, anon;
grant execute on function public.jehoo_join_room(uuid) to authenticated;
grant execute on function public.jehoo_leave_room(uuid) to authenticated;
grant execute on function public.jehoo_request_microphone(uuid) to authenticated;
grant execute on function public.jehoo_handle_microphone_request(uuid,boolean) to authenticated;