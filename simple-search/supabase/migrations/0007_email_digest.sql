-- Email digest feature for daily research updates
-- Adds fields to profiles table to support daily email digest functionality

-- Add email digest fields to profiles table
ALTER TABLE public.profiles
  ADD COLUMN email_digest_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN last_digest_sent_at TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN public.profiles.email_digest_enabled IS 'Whether user has opted in to receive daily email digests of their personal feed';
COMMENT ON COLUMN public.profiles.last_digest_sent_at IS 'Timestamp of when the last digest email was successfully sent to this user';

-- Index for cron job efficiency (query users who need digests)
CREATE INDEX profiles_email_digest_enabled_idx
  ON public.profiles (email_digest_enabled)
  WHERE email_digest_enabled = true;