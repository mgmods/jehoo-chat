-- Allow duplicate nicknames and make the six-digit public ID immutable by default.
-- A public ID can only change through the purchase entitlement flow.

drop index if exists public.profiles_nickname_unique_idx;

create table if not exists public.jehoo_public_id_change_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchased_public_id integer not null check (purchased_public_id between 100000 and 999999),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists jehoo_public_id_change_one_active_per_user
  on public.jehoo_public_id_change_entitlements(user_id)
  where used_at is null;

create unique index if not exists jehoo_public_id_change_available_id
  on public.jehoo_public_id_change_entitlements(purchased_public_id)
  where used_at is null;

alter table public.jehoo_public_id_change_entitlements enable row level security;

drop policy if exists "Users can view own active ID purchase" on public.jehoo_public_id_change_entitlements;
create policy "Users can view own active ID purchase"
on public.jehoo_public_id_change_entitlements
for select to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.prevent_profile_public_id_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.public_id is distinct from old.public_id
     and coalesce(current_setting('jehoo.allow_public_id_change', true), 'off') <> 'on' then
    raise exception 'Jehoo public ID cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.jehoo_change_public_id_after_purchase(p_new_public_id integer)
returns public.profiles
language plpgsql
security invoker
set search_path = public
as $$
declare
  result public.profiles;
  entitlement_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_new_public_id < 100000 or p_new_public_id > 999999 then raise exception 'invalid_public_id'; end if;

  select id into entitlement_id
  from public.jehoo_public_id_change_entitlements
  where user_id = auth.uid()
    and purchased_public_id = p_new_public_id
    and used_at is null
  for update;

  if entitlement_id is null then raise exception 'id_not_purchased'; end if;
  if exists (select 1 from public.profiles where public_id = p_new_public_id) then raise exception 'public_id_taken'; end if;

  perform set_config('jehoo.allow_public_id_change', 'on', true);

  update public.profiles
  set public_id = p_new_public_id, updated_at = now()
  where id = auth.uid()
  returning * into result;

  if not found then raise exception 'profile_not_found'; end if;

  update public.jehoo_public_id_change_entitlements
  set used_at = now()
  where id = entitlement_id;

  return result;
end;
$$;

revoke all on function public.jehoo_change_public_id_after_purchase(integer) from public;
grant execute on function public.jehoo_change_public_id_after_purchase(integer) to authenticated;

create or replace function public.jehoo_complete_profile(
  p_first_name text,
  p_nickname text,
  p_gender text,
  p_birth_date date,
  p_country text,
  p_avatar_url text default null
)
returns public.profiles
language plpgsql
security invoker
set search_path = public
as $$
declare result public.profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if length(trim(coalesce(p_first_name,''))) < 2 then raise exception 'invalid_first_name'; end if;
  if length(trim(coalesce(p_nickname,''))) < 2 then raise exception 'invalid_nickname'; end if;
  if p_gender not in ('male','female') then raise exception 'invalid_gender'; end if;
  if p_birth_date is null or p_birth_date > (current_date - interval '13 years')::date or p_birth_date < (current_date - interval '100 years')::date then raise exception 'invalid_birth_date'; end if;
  if length(trim(coalesce(p_country,''))) <> 2 then raise exception 'invalid_country'; end if;

  update public.profiles
  set first_name = trim(p_first_name),
      nickname = trim(p_nickname),
      display_name = trim(p_nickname),
      gender = p_gender,
      birth_date = p_birth_date,
      country = upper(trim(p_country)),
      avatar_url = coalesce(nullif(trim(p_avatar_url),''), avatar_url),
      profile_completed = true,
      updated_at = now()
  where id = auth.uid()
  returning * into result;

  if not found then raise exception 'profile_not_found'; end if;
  return result;
end;
$$;
