-- migration: disable_rls_for_local_dev
-- purpose: disable row level security policies for local development and testing
-- affected: user_settings, ai_participants, conversations, messages
-- special considerations:
--   - ⚠️ WARNING: this migration is intended ONLY for local development
--   - ⚠️ DO NOT run this migration in production environments
--   - disables all rls policies and row level security on public tables
--   - allows unrestricted access to all data regardless of auth.uid()
--   - useful for debugging, testing, and seeding data locally
--   - to re-enable rls, run: 20250114121000_enable_rls_for_production.sql

-- ============================================================================
-- ⚠️ WARNING: local development only - do not run in production
-- ============================================================================

-- drop all rls policies and disable rls on user_settings
drop policy if exists "Users can view own settings" on user_settings;
drop policy if exists "Users can insert own settings" on user_settings;
drop policy if exists "Users can update own settings" on user_settings;
alter table user_settings disable row level security;

-- drop all rls policies and disable rls on ai_participants
drop policy if exists "Users can view own participants" on ai_participants;
drop policy if exists "Users can insert own participants" on ai_participants;
drop policy if exists "Users can update own participants" on ai_participants;
drop policy if exists "Users can delete own participants" on ai_participants;
alter table ai_participants disable row level security;

-- drop all rls policies and disable rls on conversations
drop policy if exists "Users can view own conversations" on conversations;
drop policy if exists "Users can insert own conversations" on conversations;
drop policy if exists "Users can update own conversations" on conversations;
drop policy if exists "Users can delete own conversations" on conversations;
alter table conversations disable row level security;

-- drop all rls policies and disable rls on messages
drop policy if exists "Users can view messages from own conversations" on messages;
drop policy if exists "Users can insert messages to own conversations" on messages;
drop policy if exists "Users can delete messages from own conversations" on messages;
alter table messages disable row level security;

-- ============================================================================
-- notes
-- ============================================================================
-- after running this migration:
-- - all tables are accessible without authentication
-- - all data is visible to all users
-- - perfect for local testing with tools like pgadmin, dbeaver, etc.
-- - to restore security: run 20250114121000_enable_rls_for_production.sql

