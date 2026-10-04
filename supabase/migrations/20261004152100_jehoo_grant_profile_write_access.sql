-- Allow authenticated clients to create and update their own profile rows.
-- RLS policies still restrict the rows to auth.uid().
grant select, insert, update on table public.profiles to authenticated;
