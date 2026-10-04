insert into storage.buckets (id,name,public) values ('room-covers','room-covers',true) on conflict (id) do update set public=excluded.public;
drop policy if exists "room_covers_public_read" on storage.objects;
create policy "room_covers_public_read" on storage.objects for select using (bucket_id='room-covers');
drop policy if exists "room_covers_owner_insert" on storage.objects;
create policy "room_covers_owner_insert" on storage.objects for insert to authenticated with check (bucket_id='room-covers' and exists(select 1 from public.rooms r where r.id::text=split_part(name,'/',1) and r.owner_id=auth.uid()));
drop policy if exists "room_covers_owner_update" on storage.objects;
create policy "room_covers_owner_update" on storage.objects for update to authenticated using (bucket_id='room-covers' and exists(select 1 from public.rooms r where r.id::text=split_part(name,'/',1) and r.owner_id=auth.uid())) with check (bucket_id='room-covers' and exists(select 1 from public.rooms r where r.id::text=split_part(name,'/',1) and r.owner_id=auth.uid()));
drop policy if exists "room_covers_owner_delete" on storage.objects;
create policy "room_covers_owner_delete" on storage.objects for delete to authenticated using (bucket_id='room-covers' and exists(select 1 from public.rooms r where r.id::text=split_part(name,'/',1) and r.owner_id=auth.uid()));