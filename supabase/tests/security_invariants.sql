-- JEHOO security invariants. Run against a non-production test project before release.
do $$
declare
  message_policy text;
begin
  if has_table_privilege('authenticated','public.wallets','UPDATE') then
    raise exception 'FAIL: authenticated clients can update wallet balances';
  end if;
  if has_column_privilege('authenticated','public.profiles','vip_level','UPDATE') then
    raise exception 'FAIL: authenticated clients can update VIP';
  end if;
  if has_column_privilege('authenticated','public.profiles','level','UPDATE') then
    raise exception 'FAIL: authenticated clients can update level';
  end if;
  if has_table_privilege('authenticated','public.admin_user_roles','INSERT') then
    raise exception 'FAIL: authenticated clients can assign staff roles';
  end if;
  if has_function_privilege('authenticated','public.jehoo_apply_wallet_adjustment(uuid,uuid,bigint,text,text)','EXECUTE') then
    raise exception 'FAIL: authenticated clients can call wallet adjustment RPC';
  end if;
  if not has_function_privilege('service_role','public.jehoo_apply_wallet_adjustment(uuid,uuid,bigint,text,text)','EXECUTE') then
    raise exception 'FAIL: service role cannot call wallet adjustment RPC';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.messages'::regclass) then
    raise exception 'FAIL: messages RLS is disabled';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.wallets'::regclass) then
    raise exception 'FAIL: wallets RLS is disabled';
  end if;
  select qual into message_policy from pg_policies
   where schemaname='public' and tablename='messages' and policyname='messages_read_member_or_staff';
  if message_policy is null or position('has_permission' in message_policy)>0 then
    raise exception 'FAIL: staff must access stored messages through audited Edge Function only';
  end if;
  if (select count(*) from public.app_roles) <> 5 then
    raise exception 'FAIL: expected five baseline roles';
  end if;
  raise notice 'PASS: JEHOO security invariants';
end;
$$;
