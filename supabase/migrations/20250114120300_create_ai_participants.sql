-- migration: create_ai_participants
-- purpose: create ai_participants table for storing ai participant definitions
-- affected: new table: ai_participants
-- special considerations:
--   - alias must be unique per user (composite unique constraint)
--   - hard delete strategy: physical removal from database
--   - messages.ai_participant_id set to null when participant deleted
--   - no check constraints: validation in application layer
--   - no updated_at: no editing in mvp

-- create ai_participants table
-- stores ai participant definitions (alias, model, color)
create table ai_participants (
  -- primary key
  id uuid primary key default gen_random_uuid(),
  
  -- foreign key to auth.users
  -- cascade delete: remove participants when user is deleted
  user_id uuid not null references auth.users(id) on delete cascade,
  
  -- participant alias (max 30 characters)
  -- validation in application: alphanumeric + spaces + special chars (-, _, .)
  alias varchar(30) not null,
  
  -- openrouter model identifier (max 150 characters)
  -- validated by dropdown populated from openrouter api
  model_id varchar(150) not null,
  
  -- display color in hex format (#rrggbb)
  -- validation in application: must be valid hex color
  color varchar(7) not null,
  
  -- timestamp for record creation
  created_at timestamptz not null default now(),
  
  -- unique constraint: alias must be unique per user
  -- allows same alias for different users
  -- makes alias available again after participant deletion
  constraint unique_user_alias unique(user_id, alias)
);

-- note: explicit index not needed on (user_id, alias) due to unique constraint
-- postgresql automatically creates an index for unique constraints

