-- migration: create_functions_and_triggers
-- purpose: create postgresql functions and triggers for automated behavior
-- affected: new functions and triggers
-- special considerations:
--   - handle_new_user uses security definer to bypass rls
--   - set search_path = public prevents schema poisoning
--   - triggers enable automatic data management

-- ============================================================================
-- function and trigger: auto-create user_settings on user registration
-- ============================================================================

-- function: handle_new_user
-- purpose: automatically create user_settings record for newly registered users
-- trigger: executes after insert on auth.users
-- security definer: allows insert to user_settings despite rls policies
-- search_path: hardcoded to public schema to prevent schema poisoning attacks
create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
begin
  -- create user_settings record with default values
  -- openrouter_api_key defaults to null (user sets it later)
  insert into public.user_settings (user_id)
  values (new.id);
  
  return new;
end;
$$;

-- trigger: on_auth_user_created
-- fires after each user registration (insert into auth.users)
-- ensures every user has corresponding user_settings record
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================================
-- function and trigger: auto-update conversation timestamp on new message
-- ============================================================================

-- function: update_conversation_timestamp
-- purpose: automatically update conversations.updated_at when message added
-- trigger: executes after insert on messages
-- enables "most recent first" sorting of conversations
create or replace function public.update_conversation_timestamp()
returns trigger
language plpgsql
as $$
begin
  -- update the timestamp of the conversation that received the new message
  -- uses now() to set current timestamp
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  
  return new;
end;
$$;

-- trigger: message_updates_conversation
-- fires after each message insert
-- keeps conversations.updated_at synchronized with latest message
-- note: only fires on insert (messages are immutable, no update/delete triggers)
create trigger message_updates_conversation
  after insert on public.messages
  for each row
  execute function public.update_conversation_timestamp();

