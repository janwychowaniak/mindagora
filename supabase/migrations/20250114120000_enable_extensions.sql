-- migration: enable_extensions
-- purpose: enable postgresql extensions required for the mindagora application
-- affected: database-wide extensions
-- special considerations: pgcrypto reserved for v2 (api key encryption)

-- enable pgcrypto extension for cryptographic functions
-- reserved for v2: will be used for encrypting openrouter_api_key
-- in mvp, api keys stored as plaintext protected by rls policies
create extension if not exists pgcrypto;

