-- =============================================================================
-- Add user name fields to profiles table
-- =============================================================================
-- This migration adds first_name and last_name columns to support the
-- welcome modal that captures user names on first login.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

COMMENT ON COLUMN public.profiles.first_name IS 'User first name, captured via welcome modal on first login';
COMMENT ON COLUMN public.profiles.last_name IS 'User last name, captured via welcome modal on first login';
