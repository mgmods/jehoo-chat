-- Guarantee exactly 20 seat records for every room, including rooms created by trusted backend functions.
create or replace function public.jehoo_seed_room_seats()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.room_seats(room_id,seat_number,status)
  select new.id, n, 'empty' from generate_series(1,20) as n
  on conflict (room_id,seat_number) do nothing;
  return new;
end;
$$;
revoke all on function public.jehoo_seed_room_seats() from public,anon,authenticated;
drop trigger if exists on_room_created_seed_seats on public.rooms;
create trigger on_room_created_seed_seats after insert on public.rooms
for each row execute function public.jehoo_seed_room_seats();

insert into public.room_seats(room_id,seat_number,status)
select r.id, n, 'empty'
from public.rooms r cross join generate_series(1,20) as n
on conflict (room_id,seat_number) do nothing;
