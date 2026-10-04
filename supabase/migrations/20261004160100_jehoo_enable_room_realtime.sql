-- Ensure realtime events reach connected room participants and chat clients.
do $$
declare
  item text;
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach item in array array[
      'public.messages',
      'public.rooms',
      'public.room_seats',
      'public.room_requests',
      'public.room_members'
    ] loop
      table_name := split_part(item, '.', 2);
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table %s', item);
      end if;
    end loop;
  end if;
end $$;
