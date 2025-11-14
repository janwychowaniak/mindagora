-- migration: create_conversations
-- purpose: create conversations table for storing user conversations
-- affected: new table: conversations
-- special considerations:
--   - title always set by application (auto-generated or user-edited)
--   - updated_at automatically updated via trigger on message insert
--   - conversation created only after first successful exchange (user + ai response)
--   - prevents orphaned conversations without messages

-- create conversations table
-- stores user conversations with ai participants
create table conversations (
  -- primary key
  id uuid primary key default gen_random_uuid(),
  
  -- foreign key to auth.users
  -- cascade delete: remove conversations when user is deleted
  user_id uuid not null references auth.users(id) on delete cascade,
  
  -- conversation title (max 100 characters)
  -- auto-generated from first 50 chars of user message, or user-edited
  -- no default: always set by application
  title varchar(100) not null,
  
  -- timestamp for conversation creation
  created_at timestamptz not null default now(),
  
  -- timestamp for last message in conversation
  -- automatically updated by trigger on message insert
  -- enables "most recent first" sorting
  updated_at timestamptz not null default now()
);

-- note: explicit indexes for conversations created in separate migration
-- see: 20250114120600_create_indexes.sql

