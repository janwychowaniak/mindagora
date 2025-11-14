-- migration: create_user_settings
-- purpose: create user_settings table for storing user preferences and api keys
-- affected: new table: user_settings
-- special considerations:
--   - 1:1 relationship with auth.users (enforced by unique constraint)
--   - openrouter_api_key stored as plaintext in mvp (protected by rls)
--   - record auto-created via trigger on user registration
--   - no updated_at column (not needed in mvp)

-- create user_settings table
-- stores user preferences including openrouter api key
create table user_settings (
  -- primary key
  id uuid primary key default gen_random_uuid(),
  
  -- foreign key to auth.users
  -- unique constraint enforces 1:1 relationship
  -- cascade delete: remove settings when user is deleted
  user_id uuid not null unique references auth.users(id) on delete cascade,
  
  -- openrouter api key (plaintext in mvp, rls protected)
  -- nullable: user may not have set api key yet
  openrouter_api_key text,
  
  -- timestamp for record creation
  created_at timestamptz not null default now()
);

-- note: explicit index not needed on user_id due to unique constraint
-- postgresql automatically creates an index for unique constraints

