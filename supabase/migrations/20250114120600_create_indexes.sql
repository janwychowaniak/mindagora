-- migration: create_indexes
-- purpose: create explicit indexes for query performance optimization
-- affected: conversations, messages tables
-- special considerations:
--   - minimalist approach: indexes only for actual query patterns (yagni principle)
--   - implicit indexes from unique/pk constraints not listed here
--   - no indexes on display-only properties (color) or non-filtered columns

-- ============================================================================
-- indexes for conversations table
-- ============================================================================

-- index for query: list user's conversations
-- supports: select * from conversations where user_id = $1
create index idx_conversations_user_id on conversations(user_id);

-- composite index for query: list user's conversations sorted by most recent
-- supports: select * from conversations where user_id = $1 order by updated_at desc
-- this index covers both filtering and sorting operations
create index idx_conversations_user_updated on conversations(user_id, updated_at desc);

-- ============================================================================
-- indexes for messages table
-- ============================================================================

-- index for query: fetch all messages in a conversation
-- supports: select * from messages where conversation_id = $1
create index idx_messages_conversation_id on messages(conversation_id);

-- composite index for query: fetch messages in chronological order
-- supports: select * from messages where conversation_id = $1 order by created_at asc
-- this index covers both filtering and sorting operations
-- enables efficient chronological message display
create index idx_messages_conversation_created on messages(conversation_id, created_at asc);

-- ============================================================================
-- notes on indexes not created (deliberate decisions)
-- ============================================================================

-- user_settings: no explicit indexes needed
--   - implicit unique index on user_id (from unique constraint)

-- ai_participants: no explicit indexes needed
--   - implicit unique index on (user_id, alias) (from unique constraint)
--   - no index on model_id: not used in filtering
--   - no index on color: display-only property

-- ============================================================================
-- indexes for delete cascade performance
-- ============================================================================

-- index to prevent full table scan on messages during participant deletion
-- on delete set null triggers update on messages table
create index if not exists idx_messages_ai_participant_id
on messages(ai_participant_id)
where ai_participant_id is not null;
