-- Avoid public_id collisions when migrating an existing profiles table.
select setval('public.jehoo_public_id_seq', greatest(coalesce((select max(public_id)::bigint from public.profiles),0)+1,1), false);
