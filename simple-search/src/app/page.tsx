'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { useAuthModal, getUserDisplayName } from '../lib/auth-hooks';
import { AuthModal } from '../components/auth-modal';

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
const TILE_ACTIONS: Array<{
  id: 'compile-methods' | 'compile-claims' | 'rate' | 'share'
  label: string
  disabled?: boolean
  description?: string
}> = [
  {
    id: 'compile-methods',
    label: 'Compile Similar Methods',
    description: 'Discover and bundle papers that share methodological approaches.',
  },
  {
    id: 'compile-claims',
    label: 'Compile Similar Claims',
    description: 'Collect papers that make comparable findings or claims.',
  },
  {
    id: 'rate',
    label: 'Rate',
    disabled: true,
    description: 'Give papers a 1–5 rating to triage quickly.',
  },
  {
    id: 'share',
    label: 'Share',
    disabled: true,
    description: 'Send papers to collaborators in one click.',
  },
]

const SHELL_CLASSES = 'min-h-screen bg-slate-50 text-slate-900';
const FEED_CARD_CLASSES = 'space-y-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_25px_60px_rgba(15,23,42,0.08)]';
const DETAIL_SHELL_CLASSES = 'w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_25px_60px_rgba(15,23,42,0.08)]';
const DETAIL_HERO_CLASSES = 'rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-6 shadow-inner';
const TILE_BASE_CLASSES = 'group relative flex cursor-pointer flex-col gap-5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition duration-200 hover:border-sky-300 hover:bg-sky-50 hover:shadow-[0_0_20px_rgba(2,132,199,0.15)]';
const TILE_SELECTED_CLASSES = 'border-sky-400 bg-sky-50 shadow-[0_0_30px_rgba(2,132,199,0.2)]';
const ACTION_LIST_CLASSES = 'grid w-full gap-3 sm:grid-cols-2';
const ACTION_ITEM_BASE_CLASSES = 'flex h-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition';
const ACTION_ITEM_INTERACTIVE_CLASSES = 'cursor-pointer hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_12px_30px_rgba(56,189,248,0.12)]';
const ACTION_ITEM_DISABLED_CLASSES = 'cursor-not-allowed opacity-70';
const ACTION_LABEL_CLASSES = 'text-sm font-semibold text-slate-900';
const ACTION_DESCRIPTION_CLASSES = 'text-xs leading-relaxed text-slate-500';
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
const RESULT_SUMMARY_CLASSES = 'flex flex-wrap items-baseline gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600';
const DETAIL_METADATA_CLASSES = 'space-y-3 text-sm text-slate-600';
const DOI_LINK_CLASSES = 'text-lg font-semibold text-sky-600 underline decoration-sky-300 underline-offset-4 transition hover:text-sky-700';
const SIDEBAR_CARD_CLASSES = 'flex h-full flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_25px_60px_rgba(15,23,42,0.08)]';
const SIDEBAR_PRIMARY_BUTTON_CLASSES = 'flex items-center justify-center rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(56,189,248,0.2)] transition hover:-translate-y-0.5 hover:bg-sky-400';
const SIDEBAR_SECONDARY_BUTTON_CLASSES = 'flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900';
const SIDEBAR_TOGGLE_BUTTON_CLASSES = 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900';
const SIDEBAR_FLOAT_BUTTON_CLASSES = 'absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 z-20 hidden xl:inline-flex';
const SEARCH_SPINNER_CLASSES = 'inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent';
const DETAIL_SAVE_BUTTON_CLASSES = 'inline-flex items-center justify-center rounded-lg bg-sky-500 px-6 sm:px-8 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-[0_12px_30px_rgba(56,189,248,0.2)] transition hover:-translate-y-0.5 hover:bg-sky-400';

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

  return items.join(' · ')
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

  const handleSaveSelectedPaper = () => {
    if (!selectedPaper) return;

    if (!user) {
      authModal.openSignup();
      return;
    }

    console.log('Save to List clicked for', selectedPaper.id);
  };

  const handleCompileAction = (actionLabel: string) => {
    if (!selectedPaper) return;

    if (!user) {
      authModal.openSignup();
      return;
    }

    console.log(`${actionLabel} clicked for`, selectedPaper.id);
  };

  const handleKeywordSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keywordQuery.trim();
    const atLeastOneFilter = researchChecked || grantsChecked || patentsChecked;

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
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">Account</span>
                    <h2 className="text-xl font-semibold text-slate-900">Welcome back</h2>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">{getUserDisplayName(user)}</p>
                    <p className="text-xs text-slate-600 mt-1">{user.email}</p>
                  </div>
                  <p className="text-sm text-slate-600">
                    Your saved research and preferences are ready. Favourites will appear here once available.
                  </p>
                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={signOut}
                      className={SIDEBAR_SECONDARY_BUTTON_CLASSES}
                    >
                      Sign out
                    </button>
                  </div>
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
            <header className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">Synapse</span>
                  <h1 className="text-3xl font-semibold text-slate-900">Research Feed</h1>
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
              {lastKeywordQuery && !keywordError && (
                <div className={RESULT_SUMMARY_CLASSES}>
                  <span>Showing</span>
                  <span className="text-base font-semibold text-slate-900">{keywordResults.length}</span>
                  <span>result{keywordResults.length === 1 ? '' : 's'} for</span>
                  <span className="text-base font-semibold text-slate-900">"{lastKeywordQuery}"</span>
                </div>
              )}

              {keywordError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  {keywordError}
                </div>
              )}

              {keywordLoading ? (
                <div className={FEED_LOADING_WRAPPER_CLASSES}>
                  <span className={FEED_LOADING_PILL_CLASSES}>
                    <span className={FEED_SPINNER_CLASSES} aria-hidden="true" />
                    <span>Fetching results…</span>
                  </span>
                  {FEED_SKELETON_ITEMS.slice(0, 3).map((_, index) => (
                    <div
                      key={index}
                      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-200/60 to-transparent animate-[shimmer_1.6s_infinite]" />
                      <div className="px-6 py-8">
                        <div className="h-5 w-1/3 rounded-full bg-slate-200/80" />
                        <div className="mt-4 h-4 w-2/3 rounded-full bg-slate-200/60" />
                        <div className="mt-3 h-3 w-1/2 rounded-full bg-slate-200/50" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : keywordResults.length > 0 ? (
                <div className="space-y-3">
                  {keywordResults.map((result) => {
                    const isSelected = selectedPaper?.id === result.id

                    return (
                      <article
                        key={result.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedPaper(result)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedPaper(result)
                          }
                        }}
                        className={`${TILE_BASE_CLASSES} ${isSelected ? TILE_SELECTED_CLASSES : ''}`}
                      >
                        <div className="space-y-2">
                          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Paper</p>
                          <h3 className="text-lg font-semibold text-slate-900">{result.title}</h3>
                          <p className="text-sm text-slate-600">{formatAuthors(result.authors)}</p>
                          {formatMeta(result) && (
                            <p className="text-xs text-slate-500">{formatMeta(result)}</p>
                          )}
                        </div>

                      </article>
                    )
                  })}
                </div>
              ) : lastKeywordQuery ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-100 px-6 py-10 text-center text-sm text-slate-600">
                  Nothing surfaced for this query yet. Try refining keywords or toggling a different source.
                </div>
              ) : !user ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-4 text-center">
                    <p className="text-sm font-semibold text-sky-700">Featured Research</p>
                    <p className="text-xs text-sky-600 mt-1">Explore groundbreaking papers or register to get your personalised research feed!</p>
                  </div>
                  <div className="space-y-3">
                    {SAMPLE_PAPERS.map((result) => {
                      const isSelected = selectedPaper?.id === result.id

                      return (
                        <article
                          key={result.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedPaper(result)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setSelectedPaper(result)
                            }
                          }}
                          className={`${TILE_BASE_CLASSES} ${isSelected ? TILE_SELECTED_CLASSES : ''}`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Featured Paper</p>
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900">{result.title}</h3>
                            <p className="text-sm text-slate-600">{formatAuthors(result.authors)}</p>
                            {formatMeta(result) && (
                              <p className="text-xs text-slate-500">{formatMeta(result)}</p>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">Your Personal Feed</h3>
                  <p>Search for topics above to discover research papers. Your saved papers and preferences will appear here.</p>
                </div>
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
                </div>


              <div className={ACTION_LIST_CLASSES}>
                {TILE_ACTIONS.map((action) => {
                  const isDisabled = Boolean(action.disabled)
                  const layoutClasses =
                    action.id === 'compile-claims'
                      ? 'sm:col-start-1 sm:row-start-2'
                      : action.id === 'rate'
                      ? 'sm:col-start-2 sm:row-start-1'
                      : action.id === 'share'
                      ? 'sm:col-start-2 sm:row-start-2'
                      : ''
                  const content = (
                    <div className="flex h-full flex-col gap-2">
                      <span className={ACTION_LABEL_CLASSES}>{action.label}</span>
                      {action.description && (
                        <span className={`${ACTION_DESCRIPTION_CLASSES} ${isDisabled ? 'text-slate-400' : ''}`}>
                          {action.description}
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
                      onClick={() => {
                        if (action.id === 'compile-methods' || action.id === 'compile-claims') {
                          handleCompileAction(action.label)
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
                  {selectedPaper.doi && (
                    <p>
                      <a
                        href={`https://doi.org/${selectedPaper.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={DOI_LINK_CLASSES}
                      >
                        DOI: {selectedPaper.doi}
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
    </div>
  )
}
