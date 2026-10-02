-- Avoid exposing membership information for arbitrary users through the policy helper.
create or replace function private.is_current_user_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists(select 1 from public.conversation_members cm where cm.conversation_id=p_conversation_id and cm.user_id=(select auth.uid()));
$$;
revoke all on function private.is_current_user_conversation_member(uuid) from public,anon;
grant execute on function private.is_current_user_conversation_member(uuid) to authenticated,service_role;
drop policy if exists conversations_members_read on public.conversations;
create policy conversations_members_read on public.conversations for select to authenticated using(private.is_current_user_conversation_member(id));
drop policy if exists conversation_members_read_self_or_staff on public.conversation_members;
create policy conversation_members_read_self_or_staff on public.conversation_members for select to authenticated using(user_id=(select auth.uid()) or private.is_current_user_conversation_member(conversation_id));
drop policy if exists messages_read_member_or_staff on public.messages;
create policy messages_read_member_or_staff on public.messages for select to authenticated using(private.is_current_user_conversation_member(conversation_id));
drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages for insert to authenticated with check(sender_id=(select auth.uid()) and private.is_current_user_conversation_member(conversation_id));
drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages for update to authenticated using(sender_id=(select auth.uid()) and private.is_current_user_conversation_member(conversation_id)) with check(sender_id=(select auth.uid()) and private.is_current_user_conversation_member(conversation_id));
revoke all on function private.is_conversation_member(uuid,uuid) from public,anon,authenticated;
