-- migration: create_messages
-- purpose: create messages table for storing conversation messages
-- affected: new table: messages
-- special considerations:
--   - messages are immutable (no update operations in mvp)
--   - ai_participant_id nullable for user messages and deleted participants
--   - ai_participant_id set to null when participant deleted (on delete set null)
--   - content max length (10k chars) validated in application, not database
--   - no updated_at: messages are immutable

-- create messages table
-- stores individual messages within conversations
create table messages (
  -- primary key
  id uuid primary key default gen_random_uuid(),
  
  -- foreign key to conversations
  -- cascade delete: remove messages when conversation is deleted
  conversation_id uuid not null references conversations(id) on delete cascade,
  
  -- message role: 'user' or 'assistant'
  -- uses enum type for type safety and memory efficiency
  role message_role not null,
  
  -- message content
  -- text type: unlimited length (practical limit ~1gb in postgresql)
  -- application enforces max 10,000 characters
  content text not null,
  
  -- foreign key to ai_participants
  -- nullable: null for user messages and deleted participants
  -- set null on delete: preserve message history when participant deleted
  -- logic:
  --   - role='user': ai_participant_id is always null
  --   - role='assistant' + active participant: ai_participant_id not null
  --   - role='assistant' + deleted participant: ai_participant_id is null
  ai_participant_id uuid references ai_participants(id) on delete set null,
  
  -- timestamp for message creation
  -- immutable: no updated_at needed
  created_at timestamptz not null default now()
);

-- note: explicit indexes for messages created in separate migration
-- see: 20250114120600_create_indexes.sql

