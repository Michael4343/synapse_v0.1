'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { LogOut, UserCog, X } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useAuthModal, getUserDisplayName } from '../lib/auth-hooks';
import { createClient } from '../lib/supabase';
import { AuthModal } from '../components/auth-modal';
import type { ProfilePersonalization } from '../lib/profile-types';
import { SaveToListModal } from '../components/save-to-list-modal';
import { RateModal } from '../components/rate-modal';
import { StarRating } from '../components/star-rating';

interface ApiSearchResult {
  id: string
  title: string
  abstract: string | null
  authors: string[]
  year: number | null
  venue: string | null
  citationCount: number | null
  semanticScholarId: string
  arxivId: string | null
  doi: string | null
  url: string | null
  source: string
}

interface UserListSummary {
  id: number
  name: string
  items_count: number
  status?: 'loading' | 'ready'
}

interface PaperRating {
  id: number
  user_id: string
  paper_semantic_scholar_id: string
  paper_title: string
  rating: number
  comment: string | null
  created_at: string
  updated_at: string
}

const FEED_SKELETON_ITEMS = Array.from({ length: 6 })

// Sample papers to show in default feed
const SAMPLE_PAPERS: ApiSearchResult[] = [
  {
    id: 'sample-1',
    title: 'Attention Is All You Need',
    abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.',
    authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit'],
    year: 2017,
    venue: 'NeurIPS',
    citationCount: 89247,
    semanticScholarId: 'sample-1',
    arxivId: '1706.03762',
    doi: '10.48550/arXiv.1706.03762',
    url: 'https://arxiv.org/abs/1706.03762',
    source: 'sample_data'
  },
  {
    id: 'sample-2',
    title: 'Language Models are Few-Shot Learners',
    abstract: 'Recent work has demonstrated substantial gains on many NLP tasks and benchmarks by pre-training on a large corpus of text followed by fine-tuning on a specific task. While typically task-agnostic in architecture, this method still requires task-specific fine-tuning datasets of thousands or tens of thousands of examples.',
    authors: ['Tom B. Brown', 'Benjamin Mann', 'Nick Ryder', 'Melanie Subbiah'],
    year: 2020,
    venue: 'NeurIPS',
    citationCount: 42156,
    semanticScholarId: 'sample-2',
    arxivId: '2005.14165',
    doi: '10.48550/arXiv.2005.14165',
    url: 'https://arxiv.org/abs/2005.14165',
    source: 'sample_data'
  },
  {
    id: 'sample-3',
    title: 'Deep Residual Learning for Image Recognition',
    abstract: 'Deeper neural networks are more difficult to train. We present a residual learning framework to ease the training of networks that are substantially deeper than those used previously. We explicitly reformulate the layers as learning residual functions with reference to the layer inputs, instead of learning unreferenced functions.',
    authors: ['Kaiming He', 'Xiangyu Zhang', 'Shaoqing Ren', 'Jian Sun'],
    year: 2016,
    venue: 'CVPR',
    citationCount: 156892,
    semanticScholarId: 'sample-3',
    arxivId: '1512.03385',
    doi: '10.1109/CVPR.2016.90',
    url: 'https://arxiv.org/abs/1512.03385',
    source: 'sample_data'
  },
  {
    id: 'sample-4',
    title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
    abstract: 'We introduce a new language representation model called BERT, which stands for Bidirectional Encoder Representations from Transformers. Unlike recent language representation models, BERT is designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context in all layers.',
    authors: ['Jacob Devlin', 'Ming-Wei Chang', 'Kenton Lee', 'Kristina Toutanova'],
    year: 2019,
    venue: 'NAACL',
    citationCount: 68431,
    semanticScholarId: 'sample-4',
    arxivId: '1810.04805',
    doi: '10.48550/arXiv.1810.04805',
    url: 'https://arxiv.org/abs/1810.04805',
    source: 'sample_data'
  }
]
type TileActionId = 'compile-methods' | 'compile-claims' | 'rate' | 'share'
type CompileActionId = Extract<TileActionId, 'compile-methods' | 'compile-claims'>

interface CompileState {
  actionId: CompileActionId | null
  status: 'idle' | 'loading' | 'success' | 'error'
  message: string
  tempListId: number | null
  listName: string | null
  listId: number | null
  summary: string | null
}

const TILE_ACTIONS: Array<{
  id: TileActionId
  label: string
  disabled?: boolean
  description?: string
}> = [
  {
    id: 'compile-claims',
    label: 'Compile Similar Claims',
  },
  {
    id: 'compile-methods',
    label: 'Compile Similar Methods',
    disabled: true,
  },
  {
    id: 'rate',
    label: 'Comment',
    disabled: true,
  },
  {
    id: 'share',
    label: 'Share',
    disabled: true,
  },
]

const INITIAL_COMPILE_STATE: CompileState = {
  actionId: null,
  status: 'idle',
  message: '',
  tempListId: null,
  listName: null,
  listId: null,
  summary: null,
}

const SHELL_CLASSES = 'min-h-screen bg-slate-50 text-slate-900';
const FEED_CARD_CLASSES = 'space-y-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_25px_60px_rgba(15,23,42,0.08)]';
const DETAIL_SHELL_CLASSES = 'w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_25px_60px_rgba(15,23,42,0.08)]';
const DETAIL_HERO_CLASSES = 'rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-6 shadow-inner';
const TILE_BASE_CLASSES = 'group relative flex cursor-pointer flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 transition duration-150 hover:border-slate-300 hover:bg-slate-50';
const TILE_SELECTED_CLASSES = 'border-sky-400 bg-sky-50 ring-1 ring-sky-100';
const ACTION_LIST_CLASSES = 'grid w-full gap-2 grid-cols-1 sm:grid-cols-4';
const ACTION_ITEM_BASE_CLASSES = 'flex h-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition';
const ACTION_ITEM_INTERACTIVE_CLASSES = 'cursor-pointer hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_12px_30px_rgba(56,189,248,0.12)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none disabled:hover:border-slate-200';
const ACTION_ITEM_DISABLED_CLASSES = 'cursor-not-allowed opacity-70';
const ACTION_LABEL_CLASSES = 'text-sm font-semibold text-slate-900';
const ACTION_DESCRIPTION_CLASSES = 'text-xs leading-relaxed text-slate-500';
const ACTION_SPINNER_CLASSES = 'inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent';
const FEED_LOADING_WRAPPER_CLASSES = 'relative flex flex-col gap-3';
const FEED_SPINNER_CLASSES = 'inline-block h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent';
const FEED_LOADING_PILL_CLASSES = 'inline-flex items-center gap-2 self-start rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-600 shadow-sm';
const SEARCH_CONTAINER_CLASSES = 'relative flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm';
const SEARCH_INPUT_CLASSES = 'w-full bg-transparent px-5 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none';
const SEARCH_BUTTON_CLASSES = 'mr-2 inline-flex items-center rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-sky-400';
const FILTER_BAR_CLASSES = 'flex gap-2 border-t border-slate-200 pt-4 overflow-x-auto';
const FILTER_CHECKBOX_LABEL_CLASSES = 'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 whitespace-nowrap';
const FILTER_CHECKBOX_DISABLED_LABEL_CLASSES = 'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-2.5 py-2 text-xs font-medium text-slate-400 opacity-80 cursor-not-allowed whitespace-nowrap';
const FILTER_CHECKBOX_INPUT_CLASSES = 'h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500';
const FILTER_CHECKBOX_INPUT_DISABLED_CLASSES = 'text-slate-300 focus:ring-0';
const RESULT_SUMMARY_CLASSES = 'flex flex-wrap items-baseline gap-2 text-sm text-slate-600';
const DETAIL_METADATA_CLASSES = 'space-y-3 text-sm text-slate-600';
const DETAIL_LINK_CLASSES = 'text-lg font-semibold text-sky-600 underline decoration-sky-300 underline-offset-4 transition hover:text-sky-700';
const TILE_LINK_CLASSES = 'inline-flex items-center text-xs font-semibold text-sky-600 underline decoration-sky-300 underline-offset-4 transition hover:text-sky-700';
const SIDEBAR_CARD_CLASSES = 'flex h-full flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_25px_60px_rgba(15,23,42,0.08)]';
const SIDEBAR_PRIMARY_BUTTON_CLASSES = 'flex items-center justify-center rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(56,189,248,0.2)] transition hover:-translate-y-0.5 hover:bg-sky-400';
const SIDEBAR_SECONDARY_BUTTON_CLASSES = 'flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900';
const SIDEBAR_TOGGLE_BUTTON_CLASSES = 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900';
const SIDEBAR_FLOAT_BUTTON_CLASSES = 'absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 z-20 hidden xl:inline-flex';
const SEARCH_SPINNER_CLASSES = 'inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent';
const DETAIL_SAVE_BUTTON_CLASSES = 'inline-flex items-center justify-center rounded-lg bg-sky-500 px-6 sm:px-8 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-[0_12px_30px_rgba(56,189,248,0.2)] transition hover:-translate-y-0.5 hover:bg-sky-400';
const PROFILE_CARD_CLASSES = 'rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_25px_60px_rgba(15,23,42,0.08)]';
const ACCOUNT_ICON_BUTTON_CLASSES = 'inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900';
const PROFILE_LABEL_CLASSES = 'text-sm font-medium text-slate-700';
const PROFILE_INPUT_CLASSES = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100';
const PROFILE_PRIMARY_BUTTON_CLASSES = 'inline-flex items-center justify-center rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60';
const PROFILE_COMING_SOON_HINT_CLASSES = 'text-xs font-medium text-slate-400';
const PROFILE_DISABLED_UPLOAD_BUTTON_CLASSES = 'flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed';

const PROMPT_ARTIFACT_PATTERNS = [
  'target paper:',
  'research focus:',
  'output requirements:',
  'you are an assistant',
  'task: identify up to',
]

function containsResearchPromptArtifacts(text: string) {
  const lower = text.toLowerCase()
  return PROMPT_ARTIFACT_PATTERNS.some((pattern) => lower.includes(pattern))
}

function formatAuthors(authors: string[]) {
  if (!authors.length) return 'Author information unavailable'
  if (authors.length <= 3) return authors.join(', ')
  return `${authors.slice(0, 3).join(', ')} +${authors.length - 3}`
}

function formatMeta(result: ApiSearchResult) {
  const items: string[] = []

  if (result.venue) {
    items.push(result.venue)
  }

  if (result.year) {
    items.push(String(result.year))
  }

  if (typeof result.citationCount === 'number' && Number.isFinite(result.citationCount) && result.citationCount >= 0) {
    const formattedCount = result.citationCount.toLocaleString()
    items.push(`${formattedCount} citation${result.citationCount === 1 ? '' : 's'}`)
  }

  return items.join(' • ')
}

function buildDoiUrl(doi?: string | null): string | null {
  if (!doi) {
    return null
  }

  const trimmed = doi.trim()
  if (!trimmed) {
    return null
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (trimmed.startsWith('doi.org/')) {
    return `https://${trimmed}`
  }

  if (trimmed.startsWith('10.')) {
    return `https://doi.org/${trimmed}`
  }

  return trimmed
}

function buildExternalUrl(url?: string | null): string | null {
  if (!url) {
    return null
  }

  const trimmed = url.trim()
  if (!trimmed) {
    return null
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (trimmed.startsWith('www.')) {
    return `https://${trimmed}`
  }

  return trimmed
}

function getPrimaryLink(result: ApiSearchResult): { href: string; label: string } | null {
  const doiUrl = buildDoiUrl(result.doi)
  if (doiUrl) {
    const displayDoi = result.doi?.replace(/^https?:\/\//i, '') ?? result.doi ?? doiUrl
    return {
      href: doiUrl,
      label: `DOI: ${displayDoi}`
    }
  }

  const externalUrl = buildExternalUrl(result.url)
  if (externalUrl) {
    try {
      const parsed = new URL(externalUrl)
      const hostname = parsed.hostname.replace(/^www\./i, '')
      return {
        href: externalUrl,
        label: `View on ${hostname}`
      }
    } catch (error) {
      return {
        href: externalUrl,
        label: 'View source'
      }
    }
  }

  return null
}

interface UserProfile {
  orcid_id: string | null
  academic_website: string | null
  profile_personalization: ProfilePersonalization | null
  last_profile_enriched_at: string | null
  profile_enrichment_version: string | null
}

function formatRelativeTime(timestamp: string | null | undefined) {
  if (!timestamp) {
    return 'Never'
  }

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.round(diffMs / (1000 * 60))

  if (diffMinutes < 1) {
    return 'Just now'
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  }

  return date.toLocaleString()
}

function parseManualKeywords(input: string) {
  return input
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 20)
}

function createKeywordClusters(input: string) {
  // Split by newlines to get individual clusters
  const lines = input.split(/\n/).map((line) => line.trim()).filter((line) => line.length > 0)

  return lines.map((line, index) => {
    // Split by commas within each line to get keywords for this cluster
    const keywords = line.split(/,/).map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0)

    return {
      label: keywords[0] || `Cluster ${index + 1}`, // Use first keyword as label
      priority: index + 1, // Order by appearance
      keywords: keywords,
      synonyms: [],
      methods: [],
      applications: []
    }
  }).slice(0, 10) // Limit to 10 clusters max
}

function truncateTitleForList(title: string, maxLength = 64) {
  if (title.length <= maxLength) {
    return title
  }
  return `${title.slice(0, maxLength - 1)}…`
}

export default function Home() {
  const { user, signOut } = useAuth();
  const authModal = useAuthModal();

  const [keywordQuery, setKeywordQuery] = useState('');
  const [researchChecked, setResearchChecked] = useState(true);
  const [grantsChecked, setGrantsChecked] = useState(false);
  const [patentsChecked, setPatentsChecked] = useState(false);
  const [newsChecked, setNewsChecked] = useState(false);
  const [communityChecked, setCommunityChecked] = useState(false);
  const [keywordResults, setKeywordResults] = useState<ApiSearchResult[]>([]);
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [keywordError, setKeywordError] = useState('');
  const [lastKeywordQuery, setLastKeywordQuery] = useState('');
  const [selectedPaper, setSelectedPaper] = useState<ApiSearchResult | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileFormOrcid, setProfileFormOrcid] = useState('');
  const [profileFormWebsite, setProfileFormWebsite] = useState('');
  const [orcidEditingMode, setOrcidEditingMode] = useState(false);
  const [websiteEditingMode, setWebsiteEditingMode] = useState(false);
  const [profileManualKeywords, setProfileManualKeywords] = useState('');
  const [manualKeywordsSeededVersion, setManualKeywordsSeededVersion] = useState<string | null>(null);
  const [profileResumeText, setProfileResumeText] = useState('');
  const [profileSaveError, setProfileSaveError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileEnrichmentLoading, setProfileEnrichmentLoading] = useState(false);
  const [profileEnrichmentError, setProfileEnrichmentError] = useState('');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [paperToSave, setPaperToSave] = useState<ApiSearchResult | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [paperToRate, setPaperToRate] = useState<ApiSearchResult | null>(null);
  const [currentPaperRating, setCurrentPaperRating] = useState<PaperRating | null>(null);
  const [paperRatings, setPaperRatings] = useState<Map<string, PaperRating>>(new Map());
  const [userLists, setUserLists] = useState<UserListSummary[]>([]);
  const [listsLoading, setListsLoading] = useState(false);

  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [listItems, setListItems] = useState<ApiSearchResult[]>([]);
  const [listItemsLoading, setListItemsLoading] = useState(false);
  const [listItemsLoadingMessage, setListItemsLoadingMessage] = useState('');
  const [compileState, setCompileState] = useState<CompileState>(INITIAL_COMPILE_STATE);
  const [personalFeedResults, setPersonalFeedResults] = useState<ApiSearchResult[]>([]);
  const [personalFeedLoading, setPersonalFeedLoading] = useState(false);
  const [personalFeedError, setPersonalFeedError] = useState('');
  const [personalFeedLastUpdated, setPersonalFeedLastUpdated] = useState<string | null>(null);
  const [profileEditorVisible, setProfileEditorVisible] = useState(false);
  const [signOutConfirmVisible, setSignOutConfirmVisible] = useState(false);

  const profileManualKeywordsRef = useRef('');
  const isMountedRef = useRef(true);
  const signOutPopoverRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!signOutConfirmVisible) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!signOutPopoverRef.current) {
        return;
      }

      if (!signOutPopoverRef.current.contains(event.target as Node)) {
        setSignOutConfirmVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [signOutConfirmVisible]);

  useEffect(() => {
    profileManualKeywordsRef.current = profileManualKeywords;
  }, [profileManualKeywords]);

  useEffect(() => {
    if (!user) {
      setSignOutConfirmVisible(false);
    }
  }, [user]);

  const getAuthHeaders = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchUserLists = useCallback(async () => {
    if (!user) return;

    setListsLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch('/api/lists', {
        headers: authHeaders,
      });
      if (response.ok) {
        const data = await response.json();
        const lists = Array.isArray(data.lists) ? data.lists : [];
        setUserLists((previous) => {
          const readyLists: UserListSummary[] = lists.map((list: any) => ({
            id: list.id,
            name: list.name,
            items_count: typeof list.items_count === 'number' ? list.items_count : 0,
            status: 'ready' as const,
          }));

          if (previous.length === 0) {
            return readyLists;
          }

          const readyIds = new Set(readyLists.map((list) => list.id));
          const placeholders = previous.filter((list) => list.status === 'loading' && !readyIds.has(list.id));

          return [...placeholders, ...readyLists];
        });
      }
    } catch (error) {
      console.error('Failed to fetch user lists:', error);
    } finally {
      setListsLoading(false);
    }
  }, [getAuthHeaders, user]);

  const fetchListItems = useCallback(async (listId: number) => {
    if (!user) return;

    setListItemsLoading(true);
    setListItemsLoadingMessage('Loading list items…');
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`/api/lists/${listId}/items`, {
        headers: authHeaders,
      });
      if (response.ok) {
        const data = await response.json();
        const papers = data.list?.items?.map((item: any) => item.paper_data) || [];
        setListItems(papers);
        // Auto-select first paper if available
        if (papers.length > 0) {
          setSelectedPaper(papers[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch list items:', error);
    } finally {
      setListItemsLoading(false);
      setListItemsLoadingMessage('');
    }
  }, [getAuthHeaders, user]);

  // Set initial selected paper based on authentication status
  useEffect(() => {
    if (!user && !selectedPaper && keywordResults.length === 0 && !lastKeywordQuery) {
      // Non-authenticated users start with first sample paper selected
      setSelectedPaper(SAMPLE_PAPERS[0]);
    } else if (user && selectedPaper?.source === 'sample_data' && keywordResults.length === 0) {
      // Authenticated users don't start with sample papers selected
      setSelectedPaper(null);
    }
  }, [user, selectedPaper, keywordResults.length, lastKeywordQuery]);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      return;
    }

    setProfileLoading(true);
    setProfileError('');

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('orcid_id, academic_website, profile_personalization, last_profile_enriched_at, profile_enrichment_version')
        .eq('id', user.id)
        .single();

      if (!isMountedRef.current) {
        return;
      }

      if (error) {
        console.error('Failed to load profile', error);
        setProfile(null);
        setProfileError('We could not load your research profile. Please try again.');
      } else {
        setProfile({
          orcid_id: data?.orcid_id ?? null,
          academic_website: data?.academic_website ?? null,
          profile_personalization: data?.profile_personalization ?? null,
          last_profile_enriched_at: data?.last_profile_enriched_at ?? null,
          profile_enrichment_version: data?.profile_enrichment_version ?? null,
        });
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error('Unexpected profile load error', error);
        setProfile(null);
        setProfileError('We could not load your research profile. Please try again.');
      }
    } finally {
      if (isMountedRef.current) {
        setProfileLoading(false);
      }
    }
  }, [user]);

  const profilePersonalization = profile?.profile_personalization ?? null;
  const profileTopicClusters = profilePersonalization?.topic_clusters ?? [];

  const buildClusterQuery = (cluster: ProfilePersonalization['topic_clusters'][number]) => {
    const keywords = Array.isArray(cluster.keywords) ? cluster.keywords : [];
    const synonyms = Array.isArray(cluster.synonyms) ? cluster.synonyms : [];
    const methods = Array.isArray(cluster.methods) ? cluster.methods : [];
    const applications = Array.isArray(cluster.applications) ? cluster.applications : [];
    const terms = [...keywords, ...synonyms, ...methods, ...applications]
      .map((term) => term?.trim())
      .filter((term): term is string => Boolean(term));

    if (!terms.length) {
      return '';
    }

    // Use all terms, not just first 6
    const quotedTerms = terms.map((term) => (term.includes(' ') ? `"${term}"` : term));
    return quotedTerms.join(' ');
  };

  const loadPersonalFeed = useCallback(
    async ({ personalizationOverride, minimumQueries = 1, force = false }: { personalizationOverride?: ProfilePersonalization | null; minimumQueries?: number; force?: boolean } = {}) => {
      if (!user || !profile?.orcid_id) {
        return;
      }

      const activePersonalization = personalizationOverride ?? profilePersonalization;

      if (!activePersonalization || !Array.isArray(activePersonalization.topic_clusters) || activePersonalization.topic_clusters.length === 0) {
        setPersonalFeedResults([]);
        setPersonalFeedError('Add focus keywords to generate your personalised feed.');
        return;
      }

      if (personalFeedLoading && !force) {
        return;
      }

      const sortedClusters = [...activePersonalization.topic_clusters].sort((a, b) => {
        const priorityA = typeof a.priority === 'number' ? a.priority : Number.MAX_SAFE_INTEGER;
        const priorityB = typeof b.priority === 'number' ? b.priority : Number.MAX_SAFE_INTEGER;
        return priorityA - priorityB;
      });

      const queries = sortedClusters
        .map((cluster) => buildClusterQuery(cluster))
        .filter((query) => Boolean(query));

      if (!queries.length) {
        setPersonalFeedResults([]);
        setPersonalFeedError('We need more detail about your focus areas to generate results.');
        return;
      }

      setPersonalFeedLoading(true);
      setPersonalFeedError('');

      try {
        const aggregated: ApiSearchResult[] = [];
        const seen = new Set<string>();

        // Fair distribution algorithm: ensure each keyword gets proportional representation
        const maxResults = 12;
        const resultsPerQuery = Math.floor(maxResults / queries.length);
        const remainderSlots = maxResults % queries.length;

        // Create array of how many results each query should contribute
        const quotaPerQuery = queries.map((_, index) =>
          resultsPerQuery + (index < remainderSlots ? 1 : 0)
        );

        for (let queryIndex = 0; queryIndex < queries.length; queryIndex++) {
          const query = queries[queryIndex];
          const maxForThisQuery = quotaPerQuery[queryIndex];
          let addedForThisQuery = 0;

          if (aggregated.length >= maxResults) {
            break;
          }

          try {
            const response = await fetch('/api/search', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ query }),
            });

            if (!response.ok) {
              continue;
            }

            const payload = await response.json();
            const results = Array.isArray(payload.results) ? payload.results : [];

            for (const result of results) {
              if (!seen.has(result.id) && addedForThisQuery < maxForThisQuery) {
                aggregated.push(result);
                seen.add(result.id);
                addedForThisQuery++;
              }

              if (addedForThisQuery >= maxForThisQuery || aggregated.length >= maxResults) {
                break;
              }
            }
          } catch (error) {
            console.error('Personal feed query failed', error);
          }
        }

        if (!aggregated.length) {
          setPersonalFeedResults([]);
          setPersonalFeedError('We could not find new papers for your focus areas. Try refreshing in a bit or adjust your profile.');
        } else {
          setPersonalFeedResults(aggregated.slice(0, 12));
          setPersonalFeedError('');
          setPersonalFeedLastUpdated(new Date().toISOString());
        }
      } finally {
        setPersonalFeedLoading(false);
      }
    },
    [personalFeedLoading, profile?.orcid_id, profilePersonalization, user]
  );

  useEffect(() => {
    if (!user) {
      setPersonalFeedResults([]);
      setPersonalFeedError('');
      setPersonalFeedLastUpdated(null);
      return;
    }

    if (!profile?.orcid_id) {
      setPersonalFeedResults([]);
      return;
    }

   if (!profilePersonalization || !profilePersonalization.topic_clusters?.length) {
     return;
   }

    if (personalFeedResults.length === 0) {
      loadPersonalFeed({ minimumQueries: 3 });
    }
  }, [loadPersonalFeed, personalFeedResults.length, profile?.orcid_id, profilePersonalization, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (keywordLoading || keywordResults.length > 0 || lastKeywordQuery || selectedListId) {
      return;
    }

    if (personalFeedResults.length > 0) {
      setSelectedPaper((prev) => {
        if (prev && personalFeedResults.find((result) => result.id === prev.id)) {
          return prev;
        }
        return personalFeedResults[0];
      });
    }
  }, [
    keywordLoading,
    keywordResults,
    lastKeywordQuery,
    personalFeedResults,
    selectedListId,
    user,
  ]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileError('');
      setProfileLoading(false);
      setProfileFormOrcid('');
      setProfileFormWebsite('');
      setProfileManualKeywords('');
      setProfileResumeText('');
      setProfileSaveError('');
      setProfileEnrichmentError('');
      setProfileEnrichmentLoading(false);
      setPersonalFeedResults([]);
      setPersonalFeedError('');
      setPersonalFeedLastUpdated(null);
      setProfileEditorVisible(false);
      return;
    }

    refreshProfile();
    if (user) {
      fetchUserLists();
    } else {
      setUserLists([]);
    }
  }, [fetchUserLists, refreshProfile, user]);

  const runProfileEnrichment = useCallback(
    async ({
      source = 'manual_refresh',
      force = false,
      skipOrcidFetch = false,
      orcidOverride,
    }: {
      source?: string
      force?: boolean
      skipOrcidFetch?: boolean
      orcidOverride?: string | null
    } = {}) => {
      if (!user) {
        authModal.openSignup();
        return;
      }

      if (profileEnrichmentLoading) {
        return;
      }

      const effectiveOrcid = orcidOverride ?? profile?.orcid_id ?? null;
      if (!effectiveOrcid) {
        setProfileEnrichmentError('Add your ORCID iD before generating personalization.');
        return;
      }

      // Create simple keyword clusters directly from user input
      const keywordClusters = createKeywordClusters(profileManualKeywords);

      if (keywordClusters.length === 0) {
        setProfileEnrichmentError('Add at least one keyword line to generate your personalized feed.');
        return;
      }

      setProfileEnrichmentLoading(true);
      setProfileEnrichmentError('');

      try {
        // Create the personalization object with our simple keyword clusters
        const newPersonalization: ProfilePersonalization = {
          topic_clusters: keywordClusters,
          author_focus: [],
          venue_focus: [],
          filters: {
            recency_days: 1,
            publication_types: ['journal', 'conference', 'preprint'],
            include_preprints: true,
          }
        };

        // Save to profile
        const supabase = createClient();
        const { error } = await supabase
          .from('profiles')
          .update({
            profile_personalization: newPersonalization,
            last_profile_enriched_at: new Date().toISOString(),
            profile_enrichment_version: 'keyword-based'
          })
          .eq('id', user.id);

        if (error) {
          console.error('Failed to save profile personalization', error);
          setProfileEnrichmentError('Failed to save your keywords. Please try again.');
          return;
        }

        // Update local state
        setProfile((prev) => {
          if (!prev) {
            return {
              orcid_id: effectiveOrcid,
              academic_website: null,
              profile_personalization: newPersonalization,
              last_profile_enriched_at: new Date().toISOString(),
              profile_enrichment_version: 'keyword-based',
            };
          }

          return {
            ...prev,
            profile_personalization: newPersonalization,
            last_profile_enriched_at: new Date().toISOString(),
            profile_enrichment_version: 'keyword-based',
          };
        });

        // Load the personal feed with new personalization
        await loadPersonalFeed({ personalizationOverride: newPersonalization, force: true });

      } catch (error) {
        console.error('Profile enrichment request failed', error);
        setProfileEnrichmentError('We could not refresh your personalization. Please try again.');
      } finally {
        setProfileEnrichmentLoading(false);
      }
    }, [
      authModal,
      loadPersonalFeed,
      profile,
      profileEnrichmentLoading,
      profileManualKeywords,
      user,
    ]);

  useEffect(() => {
    if (profile) {
      setProfileFormOrcid(profile.orcid_id ?? '');
      setProfileFormWebsite(profile.academic_website ?? '');
      setOrcidEditingMode(false);
      setWebsiteEditingMode(false);

      const currentVersion = profile.profile_enrichment_version ?? 'initial';
      if (manualKeywordsSeededVersion !== currentVersion) {
        if (!profileManualKeywordsRef.current.trim() && profile.profile_personalization?.topic_clusters?.length) {
          const seedKeywords = profile.profile_personalization.topic_clusters
            .map((cluster) => cluster.keywords?.[0] || cluster.label)
            .filter((value): value is string => Boolean(value))
            .slice(0, 5);
          if (seedKeywords.length) {
            setProfileManualKeywords(seedKeywords.join(', '));
          }
        }
        setManualKeywordsSeededVersion(currentVersion);
      }
    } else {
      setProfileFormOrcid('');
      setProfileFormWebsite('');
      setProfileManualKeywords('');
      setManualKeywordsSeededVersion(null);
    }
  }, [profile, manualKeywordsSeededVersion]);

  const metaSummary = selectedPaper
    ? [
        selectedPaper.venue,
        selectedPaper.year,
        typeof selectedPaper.citationCount === 'number'
          ? `${selectedPaper.citationCount} citation${selectedPaper.citationCount === 1 ? '' : 's'}`
          : null,
      ]
        .filter(Boolean)
        .join(' • ')
    : '';

  const profileNeedsSetup = Boolean(user) && !profileLoading && !profileError && (!profile || !profile.orcid_id);
  const isSearchContext = keywordLoading || keywordResults.length > 0 || Boolean(lastKeywordQuery) || Boolean(keywordError);
  const isListViewActive = Boolean(selectedListId);
  const shouldShowPersonalFeed = Boolean(user && profile?.orcid_id && !profileNeedsSetup && !isSearchContext && !isListViewActive);
  const compileInProgress = compileState.status === 'loading';
  const personalizationInputs = (includeAction: boolean) => {
    const keywordsId = includeAction ? 'profile-keywords-editor' : 'profile-keywords';
    const resumeId = includeAction ? 'profile-resume-editor' : 'profile-resume';

    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <label htmlFor={keywordsId} className={PROFILE_LABEL_CLASSES}>
            Focus keywords
          </label>
          <textarea
            id={keywordsId}
            rows={4}
            value={profileManualKeywords}
            onChange={(event) => setProfileManualKeywords(event.target.value)}
            placeholder="Enter each keyword or topic on a new line:&#10;machine learning&#10;neural networks, deep learning&#10;computer vision"
            className={`${PROFILE_INPUT_CLASSES} min-h-[120px]`}
          />
          <p className="text-xs text-slate-500">
            Each line becomes a search cluster. Use commas to group related keywords together (e.g., &quot;AI, artificial intelligence&quot;).
          </p>
        </div>


      </div>
    );
  };
  const renderResultList = (results: ApiSearchResult[], contextLabel: string) => {
    const seenIds = new Set<string>();
    const uniqueResults: ApiSearchResult[] = [];

    for (const result of results) {
      if (seenIds.has(result.id)) {
        continue;
      }
      seenIds.add(result.id);
      uniqueResults.push(result);
    }

    return (
      <div className="space-y-2">
        {uniqueResults.map((result) => {
          const isSelected = selectedPaper?.id === result.id;
          const primaryLink = getPrimaryLink(result);
          const userRating = paperRatings.get(result.semanticScholarId);

          return (
            <article
              key={result.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedPaper(result)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedPaper(result);
                }
              }}
              className={`${TILE_BASE_CLASSES} ${isSelected ? TILE_SELECTED_CLASSES : ''}`}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-sky-400" aria-hidden="true" />
                  <span>{contextLabel}</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{result.title}</h3>
                <p className="text-sm text-slate-600">{formatAuthors(result.authors)}</p>
                {formatMeta(result) && (
                  <p className="text-xs text-slate-500">{formatMeta(result)}</p>
                )}
                {userRating && (
                  <div className="flex items-center gap-2">
                    <StarRating
                      rating={userRating.rating}
                      interactive={false}
                      size="sm"
                    />
                    <span className="text-xs text-slate-600">
                      Rated {userRating.rating}/5
                    </span>
                  </div>
                )}
                {primaryLink && (
                  <a
                    href={primaryLink.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={TILE_LINK_CLASSES}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {primaryLink.label}
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
    );
  };
  const renderProfileForm = (includePersonalizationInputs: boolean) => {
    const formId = includePersonalizationInputs ? 'profile-editor-form' : 'profile-form';

    return (
      <form id={formId} onSubmit={handleProfileSave} className="mt-6 space-y-5">
        <div className="space-y-2">
          <label htmlFor="profile-orcid" className={PROFILE_LABEL_CLASSES}>
            ORCID iD
          </label>
          <div className="flex gap-2">
            <input
              id="profile-orcid"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0000-0000-0000-0000"
              value={profileFormOrcid}
              onChange={(event) => setProfileFormOrcid(event.target.value)}
              disabled={profile?.orcid_id && !orcidEditingMode}
              className={`flex-1 ${PROFILE_INPUT_CLASSES} ${
                profile?.orcid_id && !orcidEditingMode
                  ? 'bg-slate-100 text-slate-500 cursor-not-allowed'
                  : ''
              }`}
            />
            {profile?.orcid_id && !orcidEditingMode && (
              <button
                type="button"
                onClick={() => setOrcidEditingMode(true)}
                className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
              >
                Update
              </button>
            )}
            {orcidEditingMode && (
              <button
                type="button"
                onClick={() => {
                  setOrcidEditingMode(false);
                  setProfileFormOrcid(profile?.orcid_id ?? '');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="profile-website" className={PROFILE_LABEL_CLASSES}>
            Academic website
          </label>
          <div className="flex gap-2">
            <input
              id="profile-website"
              type="text"
              placeholder="Enter your website URL"
              value={profileFormWebsite}
              onChange={(event) => setProfileFormWebsite(event.target.value)}
              disabled={profile?.academic_website && !websiteEditingMode}
              className={`flex-1 ${PROFILE_INPUT_CLASSES} ${
                profile?.academic_website && !websiteEditingMode
                  ? 'bg-slate-100 text-slate-500 cursor-not-allowed'
                  : ''
              }`}
            />
            {profile?.academic_website && !websiteEditingMode && (
              <button
                type="button"
                onClick={() => setWebsiteEditingMode(true)}
                className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
              >
                Update
              </button>
            )}
            {websiteEditingMode && (
              <button
                type="button"
                onClick={() => {
                  setWebsiteEditingMode(false);
                  setProfileFormWebsite(profile?.academic_website ?? '');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className={PROFILE_LABEL_CLASSES}>Bibliography</span>
            <span className={PROFILE_COMING_SOON_HINT_CLASSES}>Coming soon</span>
          </div>
          <button
            type="button"
            disabled
            aria-disabled
            className={PROFILE_DISABLED_UPLOAD_BUTTON_CLASSES}
          >
            Upload bibliography file
          </button>
        </div>

        {personalizationInputs(includePersonalizationInputs)}

        {!includePersonalizationInputs && (
          <div className="flex justify-end">
            <button type="submit" className={PROFILE_PRIMARY_BUTTON_CLASSES} disabled={profileSaving}>
              {profileSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </form>
    );
  };
  let mainFeedContent: ReactNode = null;

  if (keywordLoading) {
    mainFeedContent = (
      <div className={FEED_LOADING_WRAPPER_CLASSES}>
        <span className={FEED_LOADING_PILL_CLASSES}>
          <span className={FEED_SPINNER_CLASSES} aria-hidden="true" />
          <span>Fetching results…</span>
        </span>
        {FEED_SKELETON_ITEMS.slice(0, 3).map((_, index) => (
          <div key={index} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-200/60 to-transparent animate-[shimmer_1.6s_infinite]" />
            <div className="px-6 py-8">
              <div className="h-5 w-1/3 rounded-full bg-slate-200/80" />
              <div className="mt-4 h-4 w-2/3 rounded-full bg-slate-200/60" />
              <div className="mt-3 h-3 w-1/2 rounded-full bg-slate-200/50" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (isListViewActive && listItemsLoading) {
    mainFeedContent = (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{listItemsLoadingMessage || 'Loading list items…'}</p>
        {FEED_SKELETON_ITEMS.slice(0, 3).map((_, index) => (
          <div key={index} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-200/60 to-transparent animate-[shimmer_1.6s_infinite]" />
            <div className="px-6 py-8">
              <div className="h-5 w-1/3 rounded-full bg-slate-200/80" />
              <div className="mt-4 h-4 w-2/3 rounded-full bg-slate-200/60" />
              <div className="mt-3 h-3 w-1/2 rounded-full bg-slate-200/50" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (isListViewActive && listItems.length > 0) {
    mainFeedContent = (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {userLists.find((list) => list.id === selectedListId)?.name || 'Selected List'}
        </h2>
        {renderResultList(listItems, 'Saved paper')}
      </div>
    );
  } else if (isListViewActive) {
    mainFeedContent = (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
        This list does not have any papers yet. Start saving results to populate it.
      </div>
    );
  } else if (keywordResults.length > 0) {
    mainFeedContent = (
      <>
        <div className={RESULT_SUMMARY_CLASSES}>
          <span>Showing</span>
          <span className="text-base font-semibold text-slate-900">{keywordResults.length}</span>
          <span>result{keywordResults.length === 1 ? '' : 's'} for</span>
          <span className="text-base font-semibold text-slate-900">&ldquo;{lastKeywordQuery}&rdquo;</span>
        </div>
        {renderResultList(keywordResults, 'Search result')}
      </>
    );
  } else if (lastKeywordQuery && !keywordError) {
    mainFeedContent = (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-100 px-6 py-10 text-center text-sm text-slate-600">
        Nothing surfaced for this query yet. Try refining keywords or toggling a different source.
      </div>
    );
  } else if (shouldShowPersonalFeed) {
    if (personalFeedLoading) {
      mainFeedContent = (
        <div className={FEED_LOADING_WRAPPER_CLASSES}>
          <span className={FEED_LOADING_PILL_CLASSES}>
            <span className={FEED_SPINNER_CLASSES} aria-hidden="true" />
            <span>Refreshing your personalised feed…</span>
          </span>
          {FEED_SKELETON_ITEMS.slice(0, 3).map((_, index) => (
            <div key={index} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-200/60 to-transparent animate-[shimmer_1.6s_infinite]" />
              <div className="px-6 py-8">
                <div className="h-5 w-1/3 rounded-full bg-slate-200/80" />
                <div className="mt-4 h-4 w-2/3 rounded-full bg-slate-200/60" />
                <div className="mt-3 h-3 w-1/2 rounded-full bg-slate-200/50" />
              </div>
            </div>
          ))}
        </div>
      );
    } else if (personalFeedResults.length > 0) {
      mainFeedContent = renderResultList(personalFeedResults, 'Personal recommendation');
    } else {
      mainFeedContent = (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-600">
          {personalFeedError || 'We could not find new papers for your focus areas today. Try refreshing later or adding more keywords to your profile.'}
        </div>
      );
    }
  } else if (!user) {
    mainFeedContent = renderResultList(SAMPLE_PAPERS, 'Featured pick');
  } else {
    mainFeedContent = (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
        <h3 className="text-lg font-semibold text-slate-700 mb-2">Your Personal Feed</h3>
        <p>Search for topics above to discover research papers. Your saved papers and preferences will appear here.</p>
      </div>
    );
  }
  const shouldShowProfileSpinner = Boolean(user) && profileLoading;
  const selectedPaperPrimaryLink = selectedPaper ? getPrimaryLink(selectedPaper) : null;

  const handleSaveSelectedPaper = () => {
    if (!selectedPaper) return;

    if (!user) {
      authModal.openSignup();
      return;
    }

    setPaperToSave(selectedPaper);
    setSaveModalOpen(true);
  };

  const handleSaveModalClose = () => {
    setSaveModalOpen(false);
    setPaperToSave(null);
  };

  const handlePaperSaved = () => {
    console.log('Paper saved successfully!');
  };

  const fetchPaperRating = useCallback(async (paperId: string) => {
    if (!user) return null;

    try {
      const response = await fetch(`/api/ratings/${paperId}`);
      if (response.ok) {
        const data = await response.json();
        return data.rating;
      }
    } catch (error) {
      console.error('Failed to fetch paper rating:', error);
    }
    return null;
  }, [user]);

  const fetchPaperRatings = useCallback(async (papers: ApiSearchResult[]) => {
    if (!user || papers.length === 0) return;

    try {
      const response = await fetch('/api/ratings');
      if (response.ok) {
        const data = await response.json();
        const ratings = data.ratings as PaperRating[];

        // Create a map of paper ID to rating
        const ratingsMap = new Map<string, PaperRating>();
        ratings.forEach(rating => {
          ratingsMap.set(rating.paper_semantic_scholar_id, rating);
        });

        setPaperRatings(ratingsMap);
      }
    } catch (error) {
      console.error('Failed to fetch paper ratings:', error);
    }
  }, [user]);

  // Fetch ratings for keyword search results
  useEffect(() => {
    if (keywordResults.length > 0) {
      fetchPaperRatings(keywordResults);
    }
  }, [keywordResults, fetchPaperRatings]);

  // Fetch ratings for personal feed results
  useEffect(() => {
    if (personalFeedResults.length > 0) {
      fetchPaperRatings(personalFeedResults);
    }
  }, [personalFeedResults, fetchPaperRatings]);

  // Fetch ratings for list items
  useEffect(() => {
    if (listItems.length > 0) {
      fetchPaperRatings(listItems);
    }
  }, [listItems, fetchPaperRatings]);

  const handleRateSelectedPaper = async () => {
    if (!selectedPaper) return;

    if (!user) {
      authModal.openSignup();
      return;
    }

    // Fetch existing rating if any
    const existingRating = await fetchPaperRating(selectedPaper.semanticScholarId);
    setCurrentPaperRating(existingRating);
    setPaperToRate(selectedPaper);
    setRateModalOpen(true);
  };

  const handleRateModalClose = () => {
    setRateModalOpen(false);
    setPaperToRate(null);
    setCurrentPaperRating(null);
  };

  const handlePaperRated = () => {
    console.log('Paper rated successfully!');
    // Refresh ratings data to update UI
    const currentResults = keywordResults.length > 0 ? keywordResults
      : personalFeedResults.length > 0 ? personalFeedResults
      : listItems.length > 0 ? listItems : [];

    if (currentResults.length > 0) {
      fetchPaperRatings(currentResults);
    }
  };

  const handleListClick = (listId: number) => {
    setCompileState((previous) => {
      if (previous.status === 'loading') {
        return previous;
      }
      if (previous.listId !== null && previous.listId === listId) {
        return previous;
      }
      return INITIAL_COMPILE_STATE;
    });
    setSelectedListId(listId);
    setKeywordResults([]);
    setLastKeywordQuery('');
    setKeywordError('');
    fetchListItems(listId);
    // Clear selected paper or set to first item once loaded
    setSelectedPaper(null);
  };



  const handleCompileAction = async (actionId: CompileActionId, actionLabel: string) => {
    if (!selectedPaper) {
      return;
    }

    if (!user) {
      authModal.openSignup();
      return;
    }

    if (compileState.status === 'loading') {
      return;
    }

    const tempListId = -Date.now();
    const truncatedTitle = truncateTitleForList(selectedPaper.title);
    const placeholderName = `${actionLabel}: ${truncatedTitle}`;

    setCompileState({
      actionId,
      status: 'loading',
      message: actionId === 'compile-claims'
        ? 'Compiling similar claims…'
        : 'Compiling similar methods…',
      tempListId,
      listName: placeholderName,
      listId: null,
      summary: null,
    });

    setUserLists((previous) => {
      const filtered = previous.filter((list) => list.id !== tempListId);
      return [
        { id: tempListId, name: placeholderName, items_count: 0, status: 'loading' },
        ...filtered,
      ];
    });

    try {
      const goal = actionId === 'compile-claims' ? 'claims' : 'methods';

      const response = await fetch('/api/research/compile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paper: selectedPaper,
          goal,
          options: {
            listName: `${actionLabel}: ${truncateTitleForList(selectedPaper.title, 80)}`,
            maxResults: 12,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to compile research.');
      }

      const result = await response.json();

      if (!result.success || !result.list) {
        throw new Error(result.message || 'Research compilation failed.');
      }

      if (!isMountedRef.current) {
        return;
      }

      const createdList = result.list as { id: number; name: string; items_count: number };

      setCompileState({
        actionId,
        status: 'success',
        message: '',
        tempListId: null,
        listName: createdList.name,
        listId: createdList.id,
        summary: null,
      });

      setUserLists((previous) => {
        const filtered = previous.filter((list) => list.id !== tempListId && list.id !== createdList.id);
        return [
          { id: createdList.id, name: createdList.name, items_count: createdList.items_count, status: 'ready' },
          ...filtered,
        ];
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Research compilation failed.';

      if (!isMountedRef.current) {
        return;
      }

      setCompileState({
        actionId,
        status: 'error',
        message: errorMessage,
        tempListId: null,
        listName: placeholderName,
        listId: null,
        summary: null,
      });

      setUserLists((previous) => previous.filter((list) => list.id !== tempListId));
    }
  };

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user) {
      authModal.openSignup();
      return;
    }

    const trimmedOrcid = profileFormOrcid.trim();
    const trimmedWebsite = profileFormWebsite.trim();
    const normalisedOrcid = trimmedOrcid.toUpperCase();

    setProfileSaveError('');

    if (!normalisedOrcid) {
      setProfileSaveError('Add your ORCID iD to personalise your feed.');
      return;
    }

    const orcidPattern = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i;
    if (!orcidPattern.test(normalisedOrcid)) {
      setProfileSaveError('Enter a valid ORCID iD in the format 0000-0000-0000-0000.');
      return;
    }

    const parsedManualKeywords = parseManualKeywords(profileManualKeywords);
    if (parsedManualKeywords.length === 0) {
      setProfileSaveError('Add at least one focus keyword to personalise your feed.');
      return;
    }

    let normalizedWebsite = trimmedWebsite;
    if (trimmedWebsite) {
      // Add https:// if no protocol is provided
      if (!/^https?:\/\//i.test(trimmedWebsite)) {
        normalizedWebsite = `https://${trimmedWebsite}`;
      }

      // Basic validation - check if it looks like a valid URL
      try {
        const parsed = new URL(normalizedWebsite);
        // Additional check that it's a proper domain
        if (!parsed.hostname || parsed.hostname.length < 3) {
          setProfileSaveError('Enter a valid academic website URL or leave the field blank.');
          return;
        }
      } catch (error) {
        setProfileSaveError('Enter a valid academic website URL or leave the field blank.');
        return;
      }
    }

    setProfileSaving(true);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('profiles')
        .update({
          orcid_id: normalisedOrcid,
          academic_website: normalizedWebsite || null,
        })
        .eq('id', user.id);

      if (error) {
        console.error('Profile update failed', error);
        setProfileSaveError('We could not save your research profile. Please try again.');
        return;
      }

      const isOrcidUpdate = profile?.orcid_id && profile.orcid_id !== normalisedOrcid;

      setProfile((previous) => ({
        orcid_id: normalisedOrcid,
        academic_website: normalizedWebsite || null,
        profile_personalization: previous?.profile_personalization ?? null,
        last_profile_enriched_at: previous?.last_profile_enriched_at ?? null,
        profile_enrichment_version: previous?.profile_enrichment_version ?? null,
      }));

      // Reset editing modes
      setOrcidEditingMode(false);
      setWebsiteEditingMode(false);

      await runProfileEnrichment({
        source: isOrcidUpdate ? 'orcid_update' : 'profile_setup',
        force: true,
        orcidOverride: normalisedOrcid,
      });

      // Close the profile editor modal on successful save
      closeProfileEditor();
    } catch (error) {
      console.error('Unexpected profile update error', error);
      setProfileSaveError('Something went wrong while saving. Please try again.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleKeywordSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keywordQuery.trim();
    const atLeastOneFilter = researchChecked || grantsChecked || patentsChecked;

    // Clear list selection when searching
    setSelectedListId(null);
    setListItems([]);

    if (!trimmed) {
      setKeywordError('Enter keywords to explore the literature feed.');
      setKeywordResults([]);
      setSelectedPaper(!user ? SAMPLE_PAPERS[0] : null); // Return to default for non-auth users
      setLastKeywordQuery('');
      return;
    }

    if (!atLeastOneFilter) {
      setKeywordError('Select at least one source before searching.');
      setKeywordResults([]);
      setSelectedPaper(!user ? SAMPLE_PAPERS[0] : null); // Return to default for non-auth users
      setLastKeywordQuery('');
      return;
    }

    const filterLabels: string[] = [];
    if (researchChecked) filterLabels.push('research');
    if (grantsChecked) filterLabels.push('funding');
    if (patentsChecked) filterLabels.push('patents');

    const queryWithFilters = filterLabels.length
      ? `${trimmed} ${filterLabels.join(' ')}`
      : trimmed;

    setKeywordLoading(true);
    setKeywordError('');
    setLastKeywordQuery(trimmed);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: queryWithFilters }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload.error === 'string' ? payload.error : 'Unable to fetch results right now.';
        setKeywordError(message);
        setKeywordResults([]);
        setSelectedPaper(!user ? SAMPLE_PAPERS[0] : null); // Return to default for non-auth users
        return;
      }

      const payload = await response.json();
      const results = Array.isArray(payload.results) ? payload.results : [];
      setKeywordResults(results);
      setSelectedPaper(prev => {
        if (prev && results.find(result => result.id === prev.id)) {
          return prev;
        }
        return results[0] ?? null;
      });
    } catch (error) {
      console.error('Keyword search failed', error);
      setKeywordError('We could not reach the search service. Please try again.');
      setKeywordResults([]);
      setSelectedPaper(!user ? SAMPLE_PAPERS[0] : null); // Return to default for non-auth users
    } finally {
      setKeywordLoading(false);
    }
  };

  const handleRefreshPersonalFeed = useCallback(() => {
    setKeywordQuery('');
    setKeywordResults([]);
    setKeywordError('');
    setLastKeywordQuery('');
    setSelectedListId(null);
    setListItems([]);
    loadPersonalFeed({ force: true, minimumQueries: 3 });
  }, [loadPersonalFeed]);

  const handleSignOutRequest = useCallback(() => {
    setSignOutConfirmVisible((previous) => !previous);
  }, []);

  const handleCancelSignOut = useCallback(() => {
    setSignOutConfirmVisible(false);
  }, []);

  const handleConfirmSignOut = useCallback(() => {
    setSignOutConfirmVisible(false);
    signOut();
  }, [signOut]);

  const openProfileEditor = useCallback(() => {
    setProfileEditorVisible(true);
  }, []);

  const closeProfileEditor = useCallback(() => {
    setProfileEditorVisible(false);
  }, []);

  return (
    <div className={SHELL_CLASSES}>
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-6 py-10">
        <div className="relative flex flex-col gap-6 xl:flex-row">
          <button
            type="button"
            onClick={() => setSidebarVisible((prev) => !prev)}
            aria-pressed={sidebarVisible}
            aria-label={sidebarVisible ? 'Collapse library sidebar' : 'Expand library sidebar'}
            className={`${SIDEBAR_TOGGLE_BUTTON_CLASSES} ${SIDEBAR_FLOAT_BUTTON_CLASSES}`}
          >
            {sidebarVisible ? '<' : '>'}
          </button>
          <aside
            className={`relative ${sidebarVisible ? 'flex' : 'hidden'} flex-col transition-all duration-300 ease-in-out xl:flex xl:overflow-visible ${sidebarVisible ? 'xl:basis-[20%] xl:max-w-[20%]' : 'xl:basis-0 xl:max-w-[0%]'}`}
          >
            <div
              className={`${SIDEBAR_CARD_CLASSES} ${sidebarVisible ? '' : 'hidden'} xl:flex xl:transition-all xl:duration-300 xl:ease-out ${sidebarVisible ? 'xl:translate-x-0 xl:opacity-100' : 'xl:pointer-events-none xl:-translate-x-full xl:opacity-0'}`}
            >
              {user ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">Account</span>
                      <h2 className="text-xl font-semibold text-slate-900">Welcome back</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={openProfileEditor}
                        className={ACCOUNT_ICON_BUTTON_CLASSES}
                        aria-label="Edit profile"
                        title="Edit profile"
                      >
                        <UserCog className="h-4 w-4" />
                      </button>
                      <div className="relative" ref={signOutPopoverRef}>
                        <button
                          type="button"
                          onClick={handleSignOutRequest}
                          className={ACCOUNT_ICON_BUTTON_CLASSES}
                          aria-label="Sign out"
                          title="Sign out"
                          aria-expanded={signOutConfirmVisible}
                        >
                          <LogOut className="h-4 w-4" />
                        </button>
                        {signOutConfirmVisible && (
                          <div className="absolute right-0 top-full mt-2 w-44 rounded-lg border border-slate-200 bg-white shadow-sm">
                            <p className="px-3 py-2 text-xs text-slate-600">Sign out of Evidentia?</p>
                            <div className="grid grid-cols-2 border-t border-slate-200 text-xs">
                              <button
                                type="button"
                                onClick={handleCancelSignOut}
                                className="px-3 py-2 text-slate-500 transition hover:text-slate-700"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleConfirmSignOut}
                                className="px-3 py-2 text-rose-600 transition hover:text-rose-700"
                              >
                                Sign out
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRefreshPersonalFeed}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  >
                    <p className="text-sm font-semibold text-slate-900">{getUserDisplayName(user)}</p>
                    <p className="text-xs text-slate-600 mt-1">Click to view today&rsquo;s personalised feed.</p>
                  </button>
                  {listsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"></div>
                      Loading your lists...
                    </div>
                  ) : userLists.length > 0 ? (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-700">Your Lists</h3>
                      <div className="space-y-2">
                        {userLists.map((list) => {
                          const isSelected = selectedListId === list.id;
                          const isLoadingList = list.status === 'loading';

                          return (
                            <button
                              key={list.id}
                              type="button"
                              onClick={isLoadingList ? undefined : () => handleListClick(list.id)}
                              disabled={isLoadingList}
                              aria-busy={isLoadingList}
                              className={`w-full flex items-center justify-between rounded-lg border p-3 text-sm transition ${
                                isSelected
                                  ? 'border-sky-300 bg-sky-50 ring-1 ring-sky-200'
                                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                              } ${isLoadingList ? 'cursor-wait opacity-80' : ''}`}
                            >
                              <span className={`font-medium ${isSelected ? 'text-sky-900' : 'text-slate-900'}`}>
                                {list.name}
                              </span>
                              <span className={`text-xs ${isSelected ? 'text-sky-600' : 'text-slate-500'}`}>
                                {isLoadingList ? (
                                  <span className="flex items-center gap-2">
                                    <span
                                      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                                      aria-hidden="true"
                                    />
                                    Compiling…
                                  </span>
                                ) : (
                                  `${list.items_count} item${list.items_count === 1 ? '' : 's'}`
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">
                      Your saved research will appear here. Start by saving papers to create your first list!
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">Account</span>
                    <h2 className="text-xl font-semibold text-slate-900">Your Library</h2>
                  </div>
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={authModal.openLogin}
                    className={SIDEBAR_PRIMARY_BUTTON_CLASSES}
                  >
                    Log in
                  </button>
                  <button
                    type="button"
                    onClick={authModal.openSignup}
                    className={SIDEBAR_PRIMARY_BUTTON_CLASSES}
                  >
                    Register
                  </button>
                </div>
                </>
              )}
            </div>
          </aside>

          <section
            className={`min-w-0 transition-all duration-300 ${sidebarVisible ? 'xl:basis-[40%]' : 'xl:basis-[50%]'} xl:grow-0 ${FEED_CARD_CLASSES}`}
          >
            {/* Share Discovery Tile */}
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-100/80 p-5 text-slate-600 cursor-not-allowed opacity-60">
              <div className="flex flex-col gap-3 w-full">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">Evidentia</span>
                  <h1 className="text-3xl font-semibold text-slate-900">Share Wisdom</h1>
                </div>
                <textarea
                  disabled
                  rows={3}
                  placeholder="Share your work that is not publishable to help science move faster"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 placeholder:text-slate-400 cursor-not-allowed resize-none"
                />
              </div>
            </div>

            <header className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-3xl font-semibold text-slate-900">Research Feed</h1>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarVisible((prev) => !prev)}
                  aria-pressed={sidebarVisible}
                  aria-label={sidebarVisible ? 'Hide library sidebar' : 'Show library sidebar'}
                  className={`${SIDEBAR_TOGGLE_BUTTON_CLASSES} xl:hidden`}
                >
                  {sidebarVisible ? '<' : '>'}
                </button>
              </div>

              <form onSubmit={handleKeywordSearch} className="relative">
                <div className={SEARCH_CONTAINER_CLASSES}>
                  <input
                    type="text"
                    value={keywordQuery}
                    onChange={(e) => setKeywordQuery(e.target.value)}
                    placeholder="Search keywords, topics, authors…"
                    className={SEARCH_INPUT_CLASSES}
                  />
                  <button
                    type="submit"
                    className={`${SEARCH_BUTTON_CLASSES} ${keywordLoading ? 'cursor-not-allowed opacity-70' : ''}`}
                    disabled={keywordLoading}
                  >
                    {keywordLoading ? (
                      <span className="flex items-center gap-2">
                        <span className={SEARCH_SPINNER_CLASSES} aria-hidden="true" />
                        <span>Loading</span>
                      </span>
                    ) : (
                      'Search'
                    )}
                  </button>
                </div>
              </form>

              <div className={FILTER_BAR_CLASSES}>
                <label className={FILTER_CHECKBOX_LABEL_CLASSES}>
                  <input
                    type="checkbox"
                    checked={researchChecked}
                    onChange={() => setResearchChecked((prev) => !prev)}
                    className={FILTER_CHECKBOX_INPUT_CLASSES}
                  />
                  <span>Research</span>
                </label>
                <label className={FILTER_CHECKBOX_DISABLED_LABEL_CLASSES} title="Coming soon">
                  <input
                    type="checkbox"
                    checked={grantsChecked}
                    onChange={() => setGrantsChecked((prev) => !prev)}
                    disabled
                    aria-disabled
                    className={`${FILTER_CHECKBOX_INPUT_CLASSES} ${FILTER_CHECKBOX_INPUT_DISABLED_CLASSES}`}
                  />
                  <span>Grants</span>
                </label>
                <label className={FILTER_CHECKBOX_DISABLED_LABEL_CLASSES} title="Coming soon">
                  <input
                    type="checkbox"
                    checked={patentsChecked}
                    onChange={() => setPatentsChecked((prev) => !prev)}
                    disabled
                    aria-disabled
                    className={`${FILTER_CHECKBOX_INPUT_CLASSES} ${FILTER_CHECKBOX_INPUT_DISABLED_CLASSES}`}
                  />
                  <span>Patents</span>
                </label>
                <label className={FILTER_CHECKBOX_DISABLED_LABEL_CLASSES} title="Coming soon">
                  <input
                    type="checkbox"
                    checked={newsChecked}
                    onChange={() => setNewsChecked((prev) => !prev)}
                    disabled
                    aria-disabled
                    className={`${FILTER_CHECKBOX_INPUT_CLASSES} ${FILTER_CHECKBOX_INPUT_DISABLED_CLASSES}`}
                  />
                  <span>News</span>
                </label>
                <label className={FILTER_CHECKBOX_DISABLED_LABEL_CLASSES} title="Coming soon">
                  <input
                    type="checkbox"
                    checked={communityChecked}
                    onChange={() => setCommunityChecked((prev) => !prev)}
                    disabled
                    aria-disabled
                    className={`${FILTER_CHECKBOX_INPUT_CLASSES} ${FILTER_CHECKBOX_INPUT_DISABLED_CLASSES}`}
                  />
                  <span>Community</span>
                </label>
              </div>
            </header>

            <div className="space-y-4">
              {profileError && user && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>{profileError}</span>
                    <button
                      type="button"
                      onClick={refreshProfile}
                      className={SIDEBAR_SECONDARY_BUTTON_CLASSES}
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}

              {shouldShowProfileSpinner ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-sm text-slate-600">
                  <span className={FEED_SPINNER_CLASSES} aria-hidden="true" />
                  <p>Loading your research profile…</p>
                </div>
              ) : profileNeedsSetup && !isSearchContext ? (
                <div className={PROFILE_CARD_CLASSES}>
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-sky-600">Research profile</span>
                    <h2 className="text-2xl font-semibold text-slate-900">Personalise your feed</h2>
                    <p className="text-sm text-slate-600">
                      Add your ORCID or academic site so we can surface research that matches your expertise.
                    </p>
                  </div>

                  {profileSaveError && (
                    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                      {profileSaveError}
                    </div>
                  )}

                  {renderProfileForm(false)}
                </div>
              ) : (
                <>
                  {profileEnrichmentError && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                      {profileEnrichmentError}
                    </div>
                  )}

                  {keywordError && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                      {keywordError}
                    </div>
                  )}

                  {mainFeedContent}
                </>
              )}
            </div>
          </section>

          <aside
            className={`min-w-0 transition-all duration-300 ${sidebarVisible ? 'xl:basis-[40%]' : 'xl:basis-[50%]'} xl:grow-0 ${DETAIL_SHELL_CLASSES}`}
          >
            {selectedPaper ? (
              <div className="flex h-full flex-col gap-8">
                <div className={`${DETAIL_HERO_CLASSES} flex flex-col gap-4`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-sky-600">Paper details</p>
                    <button
                      type="button"
                      onClick={handleSaveSelectedPaper}
                      className={DETAIL_SAVE_BUTTON_CLASSES}
                    >
                      Save to List
                    </button>
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-900">{selectedPaper.title}</h2>
                  {metaSummary && (
                    <p className="text-xs text-slate-600">{metaSummary}</p>
                  )}
                  {selectedPaper && paperRatings.get(selectedPaper.semanticScholarId) && (
                    <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2">
                      <StarRating
                        rating={paperRatings.get(selectedPaper.semanticScholarId)!.rating}
                        interactive={false}
                        size="sm"
                      />
                      <span className="text-sm font-medium text-yellow-800">
                        Your rating: {paperRatings.get(selectedPaper.semanticScholarId)!.rating}/5
                      </span>
                    </div>
                  )}
                </div>


              <div className={ACTION_LIST_CLASSES}>
                {TILE_ACTIONS.map((action) => {
                  const isDisabled = Boolean(action.disabled)
                  const isCompileAction = action.id === 'compile-methods' || action.id === 'compile-claims'
                  const isActiveCompileAction = isCompileAction && compileState.actionId === action.id
                  const disableAction = isDisabled || (isCompileAction && compileInProgress)
                  const rawStatusMessage = isActiveCompileAction && compileState.status !== 'idle' ? compileState.message : ''
                  const statusMessage = rawStatusMessage && !containsResearchPromptArtifacts(rawStatusMessage)
                    ? rawStatusMessage
                    : ''
                  const statusTone = compileState.status === 'error'
                    ? 'text-rose-600'
                    : compileState.status === 'success'
                      ? 'text-emerald-600'
                      : 'text-sky-600'
                  const showSpinner = isActiveCompileAction && compileState.status === 'loading'
                  const layoutClasses = ''

                  // Handle rating-specific display logic
                  const selectedPaperRating = selectedPaper ? paperRatings.get(selectedPaper.semanticScholarId) : null
                  const displayLabel = action.id === 'rate' && selectedPaperRating
                    ? 'Update Rating'
                    : action.label
                  const displayDescription = action.id === 'rate' && selectedPaperRating
                    ? `Currently rated ${selectedPaperRating.rating}/5 star${selectedPaperRating.rating === 1 ? '' : 's'}`
                    : action.description
                  const content = (
                    <div className="flex h-full flex-col gap-2">
                      <span className={ACTION_LABEL_CLASSES}>
                        {displayLabel}
                        {showSpinner && (
                          <span className="ml-2 inline-flex items-center" aria-hidden="true">
                            <span className={ACTION_SPINNER_CLASSES} />
                          </span>
                        )}
                      </span>
                      {displayDescription && (
                        <span className={`${ACTION_DESCRIPTION_CLASSES} ${(disableAction && !isActiveCompileAction) ? 'text-slate-400' : ''}`}>
                          {displayDescription}
                        </span>
                      )}
                      {statusMessage && (
                        <span className={`${ACTION_DESCRIPTION_CLASSES} ${statusTone}`}>
                          {statusMessage}
                        </span>
                      )}
                    </div>
                  )

                  if (isDisabled) {
                    return (
                      <div
                        key={action.id}
                        className={`${ACTION_ITEM_BASE_CLASSES} ${ACTION_ITEM_DISABLED_CLASSES} ${layoutClasses}`}
                        aria-disabled="true"
                        title="Coming soon"
                      >
                        {content}
                      </div>
                    )
                  }

                  return (
                    <button
                      key={action.id}
                      type="button"
                      className={`${ACTION_ITEM_BASE_CLASSES} ${ACTION_ITEM_INTERACTIVE_CLASSES} ${layoutClasses}`}
                      disabled={disableAction}
                      aria-busy={isActiveCompileAction && compileState.status === 'loading'}
                      onClick={() => {
                        if (action.id === 'compile-methods' || action.id === 'compile-claims') {
                          void handleCompileAction(action.id, action.label)
                          return
                        }
                        if (action.id === 'rate') {
                          void handleRateSelectedPaper()
                          return
                        }
                        console.log(`${action.label} clicked for`, selectedPaper.id)
                      }}
                    >
                      {content}
                    </button>
                  )
                })}
              </div>

              <section className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Authors</h3>
                  <p className="mt-2 text-sm text-slate-700">
                    {selectedPaper.authors.length ? selectedPaper.authors.join(', ') : 'Author information unavailable.'}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Abstract</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {selectedPaper.abstract ?? 'Abstract not available for this entry.'}
                  </p>
                </div>

                <div className={DETAIL_METADATA_CLASSES}>
                  {selectedPaperPrimaryLink && (
                    <p>
                      <a
                        href={selectedPaperPrimaryLink.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={DETAIL_LINK_CLASSES}
                      >
                        {selectedPaperPrimaryLink.label}
                      </a>
                    </p>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-slate-500">
              <h2 className="text-lg font-semibold text-slate-700">No paper selected</h2>
              <p className="max-w-xs text-sm">
                Choose a result from the research feed to preview its abstract, authors, and metadata here.
              </p>
            </div>
          )}
          </aside>
        </div>
      </main>
      {/* Auth Modal */}
      <AuthModal
        isOpen={authModal.isOpen}
        mode={authModal.mode}
        onClose={authModal.close}
        onSwitchMode={authModal.switchMode}
      />
      {/* Save to List Modal */}
      <SaveToListModal
        isOpen={saveModalOpen}
        paper={paperToSave}
        onClose={handleSaveModalClose}
        onSaved={handlePaperSaved}
        userLists={userLists}
        setUserLists={setUserLists}
      />
      {/* Rate Modal */}
      <RateModal
        isOpen={rateModalOpen}
        paper={paperToRate}
        onClose={handleRateModalClose}
        onRated={handlePaperRated}
        existingRating={currentPaperRating}
      />
      {profileEditorVisible && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Profile settings</h2>
                <p className="text-xs text-slate-500">Keep your recommendations current.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  form="profile-editor-form"
                  className={PROFILE_PRIMARY_BUTTON_CLASSES}
                  disabled={profileSaving}
                >
                  {profileSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={closeProfileEditor}
                  className={ACCOUNT_ICON_BUTTON_CLASSES}
                  aria-label="Close profile editor"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
              {profileSaveError && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                  {profileSaveError}
                </div>
              )}
              {renderProfileForm(true)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
