-- migration: enable_rls
-- purpose: enable row level security and create policies for all public tables
-- affected: user_settings, ai_participants, conversations, messages
-- special considerations:
--   - rls is the main security layer for data isolation between users
--   - policies use auth.uid() to identify current authenticated user
--   - no policy = no access (explicit deny)
--   - messages use exists subquery to check conversation ownership

-- ============================================================================
-- table: user_settings
-- ============================================================================

alter table user_settings enable row level security;

-- select policy: users can view only their own settings
create policy "Users can view own settings" 
on user_settings for select 
using (auth.uid() = user_id);

-- insert policy: users can create only their own settings
-- note: typically created by trigger, but policy required for completeness
create policy "Users can insert own settings" 
on user_settings for insert 
with check (auth.uid() = user_id);

-- update policy: users can update only their own settings
-- primarily used for setting/updating openrouter_api_key
create policy "Users can update own settings" 
on user_settings for update 
using (auth.uid() = user_id);

-- delete policy: not created (no delete operation in mvp)
-- absence of policy = deny all deletes

-- ============================================================================
-- table: ai_participants
-- ============================================================================

alter table ai_participants enable row level security;

-- select policy: users can view only their own participants
create policy "Users can view own participants" 
on ai_participants for select 
using (auth.uid() = user_id);

-- insert policy: users can create only their own participants
create policy "Users can insert own participants" 
on ai_participants for insert 
with check (auth.uid() = user_id);

-- update policy: users can update only their own participants
create policy "Users can update own participants" 
on ai_participants for update 
using (auth.uid() = user_id);

-- delete policy: users can delete only their own participants
-- hard delete strategy: physically removes participant from database
-- messages.ai_participant_id set to null via on delete set null
create policy "Users can delete own participants" 
on ai_participants for delete 
using (auth.uid() = user_id);

-- ============================================================================
-- table: conversations
-- ============================================================================

alter table conversations enable row level security;

-- select policy: users can view only their own conversations
create policy "Users can view own conversations" 
on conversations for select 
using (auth.uid() = user_id);

-- insert policy: users can create only their own conversations
create policy "Users can insert own conversations" 
on conversations for insert 
with check (auth.uid() = user_id);

-- update policy: users can update only their own conversations
-- used for editing conversation titles
create policy "Users can update own conversations" 
on conversations for update 
using (auth.uid() = user_id);

-- delete policy: users can delete only their own conversations
-- cascade delete: automatically removes all messages in conversation
create policy "Users can delete own conversations" 
on conversations for delete 
using (auth.uid() = user_id);

-- ============================================================================
-- table: messages
-- ============================================================================

alter table messages enable row level security;

-- select policy: users can view messages from their own conversations
-- uses exists subquery to verify conversation ownership
-- more complex than direct user_id check due to table structure
create policy "Users can view messages from own conversations" 
on messages for select 
using (
  exists (
    select 1 from conversations 
    where conversations.id = messages.conversation_id 
    and conversations.user_id = auth.uid()
  )
);

-- insert policy: users can add messages to their own conversations
-- uses exists subquery to verify conversation ownership
-- prevents users from adding messages to other users' conversations
create policy "Users can insert messages to own conversations" 
on messages for insert 
with check (
  exists (
    select 1 from conversations 
    where conversations.id = messages.conversation_id 
    and conversations.user_id = auth.uid()
  )
);

-- update policy: not created (messages are immutable in mvp)
-- absence of policy = deny all updates

-- delete policy: users can delete messages from their own conversations
-- uses exists subquery to verify conversation ownership
create policy "Users can delete messages from own conversations" 
on messages for delete 
using (
  exists (
    select 1 from conversations 
    where conversations.id = messages.conversation_id 
    and conversations.user_id = auth.uid()
  )
);

