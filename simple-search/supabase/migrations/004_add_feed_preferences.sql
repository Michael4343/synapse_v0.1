-- Add feed_preferences column to profiles table for storing user customization settings
ALTER TABLE public.profiles
ADD COLUMN feed_preferences JSONB DEFAULT '{
  "keywords": "",
  "categories": {
    "publications": true,
    "patents": true,
    "funding_opportunities": true,
    "trending_science_news": true
  }
}'::jsonb;
-- Add index for better query performance on feed preferences
CREATE INDEX idx_profiles_feed_preferences ON public.profiles USING GIN (feed_preferences);
-- Add comment for documentation
COMMENT ON COLUMN public.profiles.feed_preferences IS 'User feed customization settings including keywords and category toggles';
