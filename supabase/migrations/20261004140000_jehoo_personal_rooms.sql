alter table public.rooms add column if not exists is_personal boolean not null default false;
create unique index if not exists rooms_one_personal_room_per_owner on public.rooms(owner_id) where is_personal = true;
create or replace function public.jehoo_get_or_create_personal_room()
returns public.rooms
language plpgsql
security invoker
set search_path = public
as $$
declare uid uuid := auth.uid(); result public.rooms;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 select * into result from public.rooms where owner_id=uid and is_personal=true limit 1;
 if found then return result; end if;
 insert into public.rooms(owner_id,name,description,status,is_featured,max_seats,livekit_room_name,is_personal)
 values(uid,'رومي الشخصي','مساحتك الصوتية الخاصة في JEHOO','active',false,20,'personal_'||replace(uid::text,'-',''),true)
 returning * into result;
 return result;
exception when unique_violation then
 select * into result from public.rooms where owner_id=uid and is_personal=true limit 1; return result;
end;
$$;
grant execute on function public.jehoo_get_or_create_personal_room() to authenticated;