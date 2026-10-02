-- Private conversation monitoring must go through an audited Edge Function.
-- Staff permissions alone do not grant direct table access to message content.
drop policy if exists conversations_members_read on public.conversations;
create policy conversations_members_read on public.conversations for select to authenticated
using (exists(select 1 from public.conversation_members cm where cm.conversation_id=id and cm.user_id=(select auth.uid())));

drop policy if exists conversation_members_read_self_or_staff on public.conversation_members;
create policy conversation_members_read_self_or_staff on public.conversation_members for select to authenticated
using (
 user_id=(select auth.uid())
 or exists(select 1 from public.conversation_members mine where mine.conversation_id=conversation_id and mine.user_id=(select auth.uid()))
);

drop policy if exists messages_read_member_or_staff on public.messages;
create policy messages_read_member_or_staff on public.messages for select to authenticated
using (exists(select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=(select auth.uid())));
