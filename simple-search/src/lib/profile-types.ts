export interface TopicCluster {
  id: string
  label: string
  keywords: string[]
  synonyms?: string[]
  methods?: string[]
  applications?: string[]
  priority: number
  source: 'llm' | 'manual' | 'orcid'
  rationale?: string
}

export interface AuthorFocus {
  name: string
  affiliation?: string
  relation?: 'self' | 'collaborator' | 'inspiration'
  priority: number
  source: 'llm' | 'manual' | 'orcid'
}

export interface VenueFocus {
  name: string
  type?: 'journal' | 'conference' | 'workshop' | 'preprint-server'
  priority: number
  source: 'llm' | 'manual' | 'orcid'
}

export interface ProfileFilters {
  recency_days: number
  publication_types: Array<'journal' | 'conference' | 'preprint' | 'dataset' | 'patent'>
  include_preprints: boolean
}

export interface ProfilePersonalization {
  topic_clusters: TopicCluster[]
  author_focus: AuthorFocus[]
  venue_focus: VenueFocus[]
  filters: ProfileFilters
}

export const DEFAULT_PROFILE_PERSONALIZATION: ProfilePersonalization = {
  topic_clusters: [],
  author_focus: [],
  venue_focus: [],
  filters: {
    recency_days: 1,
    publication_types: ['journal', 'conference', 'preprint'],
    include_preprints: true,
  },
}
