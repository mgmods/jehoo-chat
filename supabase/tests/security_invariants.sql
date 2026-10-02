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
  if has_function_privilege('anon','public.jehoo_join_room(uuid)','EXECUTE')
     or has_function_privilege('anon','public.jehoo_leave_room(uuid)','EXECUTE')
     or has_function_privilege('anon','public.jehoo_request_microphone(uuid)','EXECUTE')
     or has_function_privilege('anon','public.jehoo_handle_microphone_request(uuid,boolean)','EXECUTE') then
    raise exception 'FAIL: anonymous users can call room RPCs';
  end if;
  if (select prosecdef from pg_proc where oid='public.jehoo_join_room(uuid)'::regprocedure)
     or (select prosecdef from pg_proc where oid='public.jehoo_leave_room(uuid)'::regprocedure)
     or (select prosecdef from pg_proc where oid='public.jehoo_request_microphone(uuid)'::regprocedure)
     or (select prosecdef from pg_proc where oid='public.jehoo_handle_microphone_request(uuid,boolean)'::regprocedure) then
    raise exception 'FAIL: public room RPC wrappers must use SECURITY INVOKER';
  end if;
  if not has_function_privilege('authenticated','private.jehoo_join_room(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','private.jehoo_request_microphone(uuid)','EXECUTE') then
    raise exception 'FAIL: room RPC wrappers cannot execute internal functions';
  end if;
  if not has_function_privilege('authenticated','public.jehoo_join_room(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.jehoo_request_microphone(uuid)','EXECUTE') then
    raise exception 'FAIL: authenticated room RPC permissions are missing';
  end if;
  if has_function_privilege('authenticated','private.is_conversation_member(uuid,uuid)','EXECUTE') then
    raise exception 'FAIL: clients can inspect membership for arbitrary user IDs';
  end if;
  if not has_function_privilege('authenticated','private.is_current_user_conversation_member(uuid)','EXECUTE') then
    raise exception 'FAIL: RLS membership helper is not executable by authenticated role';
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
