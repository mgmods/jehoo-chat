-- Atomic, audited wallet adjustments for Super Admin operations.
insert into public.app_permissions(id,description)
values ('wallet.adjust','Apply audited server-side wallet adjustments')
on conflict (id) do nothing;
insert into public.role_permissions(role_id,permission_id)
values ('SUPER_ADMIN','wallet.adjust')
on conflict do nothing;

create or replace function public.jehoo_apply_wallet_adjustment(
 p_actor_id uuid, p_user_id uuid, p_amount bigint, p_idempotency_key text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_balance bigint; v_existing public.wallet_transactions%rowtype; v_tx public.wallet_transactions%rowtype;
begin
 if p_actor_id is null or p_user_id is null or p_amount is null or p_amount=0 then raise exception 'INVALID_ADJUSTMENT'; end if;
 if p_idempotency_key is null or length(p_idempotency_key)<8 or length(p_idempotency_key)>160 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
 if p_reason is null or length(trim(p_reason))<5 or length(p_reason)>500 then raise exception 'REASON_REQUIRED'; end if;
 select * into v_existing from public.wallet_transactions where user_id=p_user_id and idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('duplicate',true,'transaction_id',v_existing.id,'balance_after',v_existing.balance_after); end if;
 update public.wallets set coins=coins+p_amount,updated_at=now()
 where user_id=p_user_id and coins+p_amount>=0 returning coins into v_balance;
 if not found then
   if exists(select 1 from public.wallets where user_id=p_user_id) then raise exception 'INSUFFICIENT_COINS'; else raise exception 'WALLET_NOT_FOUND'; end if;
 end if;
 insert into public.wallet_transactions(user_id,amount,balance_after,kind,status,idempotency_key,metadata)
 values(p_user_id,p_amount,v_balance,'adjustment','completed',p_idempotency_key,jsonb_build_object('reason',trim(p_reason),'actor_id',p_actor_id))
 returning * into v_tx;
 insert into public.audit_logs(actor_id,action,target_type,target_id,before_data,after_data)
 values(p_actor_id,'wallet.adjust','wallet',p_user_id::text,
   jsonb_build_object('balance',v_balance-p_amount),
   jsonb_build_object('balance',v_balance,'amount',p_amount,'transaction_id',v_tx.id,'reason',trim(p_reason),'idempotency_key',p_idempotency_key));
 return jsonb_build_object('duplicate',false,'transaction_id',v_tx.id,'balance_after',v_balance);
exception when unique_violation then
 select * into v_existing from public.wallet_transactions where user_id=p_user_id and idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('duplicate',true,'transaction_id',v_existing.id,'balance_after',v_existing.balance_after); end if;
 raise;
end;
$$;
revoke all on function public.jehoo_apply_wallet_adjustment(uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.jehoo_apply_wallet_adjustment(uuid,uuid,bigint,text,text) to service_role;
