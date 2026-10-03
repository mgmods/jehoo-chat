create table if not exists public.app_splash_settings (
  id text primary key default 'default' check (id = 'default'),
  image_url text not null,
  storage_path text not null,
  duration_seconds integer not null default 5 check (duration_seconds between 1 and 15),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.app_splash_settings enable row level security;
grant select on public.app_splash_settings to anon, authenticated;
grant insert, update, delete on public.app_splash_settings to authenticated;

drop policy if exists app_splash_settings_public_read on public.app_splash_settings;
create policy app_splash_settings_public_read
on public.app_splash_settings for select to anon, authenticated using (true);

drop policy if exists app_splash_settings_admin_insert on public.app_splash_settings;
create policy app_splash_settings_admin_insert
on public.app_splash_settings for insert to authenticated
with check (private.has_permission('settings.manage') and updated_by = (select auth.uid()));

drop policy if exists app_splash_settings_admin_update on public.app_splash_settings;
create policy app_splash_settings_admin_update
on public.app_splash_settings for update to authenticated
using (private.has_permission('settings.manage'))
with check (private.has_permission('settings.manage') and updated_by = (select auth.uid()));

drop policy if exists app_splash_settings_admin_delete on public.app_splash_settings;
create policy app_splash_settings_admin_delete
on public.app_splash_settings for delete to authenticated
using (private.has_permission('settings.manage'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-assets', 'app-assets', true, 10485760, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists app_assets_admin_upload on storage.objects;
create policy app_assets_admin_upload
on storage.objects for insert to authenticated
with check (bucket_id = 'app-assets' and (storage.foldername(name))[1] = 'splash' and private.has_permission('settings.manage'));

drop policy if exists app_assets_admin_delete on storage.objects;
create policy app_assets_admin_delete
on storage.objects for delete to authenticated
using (bucket_id = 'app-assets' and (storage.foldername(name))[1] = 'splash' and private.has_permission('settings.manage'));

create or replace function public.audit_app_splash_settings_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.audit_logs (actor_id, action, target_type, target_id, before_data, after_data)
  values (
    auth.uid(),
    case when tg_op = 'DELETE' then 'splash.settings.deleted' else 'splash.settings.updated' end,
    'app_splash_settings',
    coalesce(old.id, new.id),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists audit_app_splash_settings_change on public.app_splash_settings;
create trigger audit_app_splash_settings_change
after insert or update or delete on public.app_splash_settings
for each row execute function public.audit_app_splash_settings_change();

revoke execute on function public.audit_app_splash_settings_change() from public, anon, authenticated;