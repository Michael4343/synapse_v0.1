-- Core profile schema for Evidentia
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  orcid_id TEXT,
  academic_website TEXT,
  profile_personalization JSONB NOT NULL DEFAULT '{
    "topic_clusters": [],
    "author_focus": [],
    "venue_focus": [],
    "filters": {
      "recency_days": 1,
      "publication_types": ["journal", "conference", "preprint"],
      "include_preprints": true
    }
  }'::jsonb,
  last_profile_enriched_at TIMESTAMPTZ,
  profile_enrichment_version TEXT
);

COMMENT ON TABLE public.profiles IS 'User profiles linked to auth.users with personalization metadata.';
COMMENT ON COLUMN public.profiles.orcid_id IS 'User ORCID identifier for academic research identity.';
COMMENT ON COLUMN public.profiles.academic_website IS 'Primary academic or personal website URL.';
COMMENT ON COLUMN public.profiles.profile_personalization IS 'Structured personalization facets produced by the enrichment workflow.';
COMMENT ON COLUMN public.profiles.last_profile_enriched_at IS 'Timestamp of the most recent profile enrichment run.';
COMMENT ON COLUMN public.profiles.profile_enrichment_version IS 'Prompt/model version used to generate the stored personalization.';

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can create their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE UNIQUE INDEX profiles_orcid_unique_idx
  ON public.profiles ((lower(orcid_id)))
  WHERE orcid_id IS NOT NULL;
