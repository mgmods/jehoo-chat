alter table public.profiles
  add column if not exists first_name text not null default '',
  add column if not exists nickname text not null default '',
  add column if not exists gender text,
  add column if not exists birth_date date,
  add column if not exists profile_completed boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_gender_check;
alter table public.profiles
  add constraint profiles_gender_check
  check (gender is null or gender in ('male','female'));

create unique index if not exists profiles_nickname_unique_idx
  on public.profiles (lower(nickname))
  where nickname <> '';

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
  set first_name=trim(p_first_name), nickname=trim(p_nickname), display_name=trim(p_nickname),
      gender=p_gender, birth_date=p_birth_date, country=upper(trim(p_country)),
      avatar_url=coalesce(nullif(trim(p_avatar_url),''),avatar_url),
      profile_completed=true, updated_at=now()
  where id=auth.uid() returning * into result;
  if not found then raise exception 'profile_not_found'; end if;
  return result;
exception when unique_violation then raise exception 'nickname_taken';
end;
$$;

revoke all on function public.jehoo_complete_profile(text,text,text,date,text,text) from public;
grant execute on function public.jehoo_complete_profile(text,text,text,date,text,text) to authenticated;
