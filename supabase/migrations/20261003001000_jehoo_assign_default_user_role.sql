-- Assign every new authenticated user the baseline USER role.
-- Elevated staff roles must be granted only through a trusted administrative workflow.
create or replace function public.jehoo_bootstrap_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 insert into public.profiles(id,public_id,display_name,avatar_url)
 values(new.id,nextval('public.jehoo_public_id_seq'),
  coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',split_part(coalesce(new.email,''),'@',1),'Jehoo User'),
  coalesce(new.raw_user_meta_data->>'avatar_url',new.raw_user_meta_data->>'picture','')) on conflict(id) do nothing;
 insert into public.user_settings(user_id) values(new.id) on conflict do nothing;
 insert into public.wallets(user_id) values(new.id) on conflict do nothing;
 insert into public.admin_user_roles(user_id,role_id) values(new.id,'USER') on conflict(user_id,role_id) do nothing;
 return new;
end;
$$;
revoke all on function public.jehoo_bootstrap_new_user() from public,anon,authenticated;
