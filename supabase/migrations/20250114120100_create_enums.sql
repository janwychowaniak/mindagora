-- migration: create_enums
-- purpose: create custom enum types for type-safe column values
-- affected: new enum type: message_role
-- special considerations: enum provides type safety and memory efficiency (2 bytes vs text)

-- create message_role enum type
-- defines the role of a message in a conversation
-- 'user': message sent by the user
-- 'assistant': message sent by an ai participant
create type message_role as enum ('user', 'assistant');

