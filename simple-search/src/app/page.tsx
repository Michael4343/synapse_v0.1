'use client';

import { useState } from 'react';

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
const TILE_ACTIONS: Array<{
  id: 'compile' | 'favorite' | 'like' | 'share'
  label: string
  icon?: string
  disabled?: boolean
}> = [
  { id: 'compile', label: 'Compile', icon: '⚡' },
  { id: 'favorite', label: 'Favourite', icon: '★', disabled: true },
  { id: 'like', label: 'Like', icon: '👍', disabled: true },
  { id: 'share', label: 'Share', icon: '↗', disabled: true },
]

const SHELL_CLASSES = 'min-h-screen bg-slate-50 text-slate-900';
const FEED_CARD_CLASSES = 'space-y-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_25px_60px_rgba(15,23,42,0.08)]';
const DETAIL_SHELL_CLASSES = 'w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_25px_60px_rgba(15,23,42,0.08)]';
const DETAIL_HERO_CLASSES = 'rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-6 shadow-inner';
const TILE_BASE_CLASSES = 'group relative flex cursor-pointer flex-col gap-5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition duration-200 hover:border-sky-300 hover:bg-sky-50 hover:shadow-[0_0_20px_rgba(2,132,199,0.15)]';
const TILE_SELECTED_CLASSES = 'border-sky-400 bg-sky-50 shadow-[0_0_30px_rgba(2,132,199,0.2)]';
const ACTION_ACTIVE_CLASSES = 'flex items-center gap-2 rounded-2xl border border-sky-300 bg-sky-100 px-4 py-2 text-xs font-semibold text-sky-700 transition hover:-translate-y-0.5 hover:bg-sky-200';
const ACTION_DISABLED_CLASSES = 'flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-400';
const SEARCH_CONTAINER_CLASSES = 'relative flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm';
const SEARCH_INPUT_CLASSES = 'w-full bg-transparent px-5 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none';
const SEARCH_BUTTON_CLASSES = 'mr-2 inline-flex items-center rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-sky-400';
const FILTER_ACTIVE_CLASSES = 'rounded-full border border-sky-300 bg-sky-100 px-4 py-2 text-xs font-semibold text-sky-700 shadow-[0_0_20px_rgba(56,189,248,0.15)]';
const FILTER_INACTIVE_CLASSES = 'rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700';
const FILTER_DISABLED_CLASSES = 'flex items-center rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-500';
const DETAIL_PRIMARY_BUTTON_CLASSES = 'inline-flex items-center justify-center rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(56,189,248,0.2)] transition hover:-translate-y-0.5 hover:bg-sky-400';
const SIDEBAR_CARD_CLASSES = 'flex h-full flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_25px_60px_rgba(15,23,42,0.08)]';
const SIDEBAR_PRIMARY_BUTTON_CLASSES = 'flex items-center justify-center rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(56,189,248,0.2)] transition hover:-translate-y-0.5 hover:bg-sky-400';
const SIDEBAR_SECONDARY_BUTTON_CLASSES = 'flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900';
const LAYOUT_TOGGLE_BUTTON_CLASSES = 'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900';
const ONBOARDING_SCRIM_CLASSES = 'absolute inset-0 bg-slate-900/40 backdrop-blur-sm';
const ONBOARDING_PANEL_CLASSES = 'relative z-10 w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_30px_80px_rgba(15,23,42,0.25)]';
const ONBOARDING_CARD_CLASSES = 'rounded-2xl border border-slate-200 bg-slate-50 p-4';
const ONBOARDING_DISMISS_CLASSES = 'rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900';
const ONBOARDING_PRIMARY_CLASSES = 'rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(56,189,248,0.25)] transition hover:bg-sky-400';

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
  const [keywordQuery, setKeywordQuery] = useState('');
  const [researchChecked, setResearchChecked] = useState(true);
  const [grantsChecked, setGrantsChecked] = useState(false);
  const [patentsChecked, setPatentsChecked] = useState(false);
  const [keywordResults, setKeywordResults] = useState<ApiSearchResult[]>([]);
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [keywordError, setKeywordError] = useState('');
  const [lastKeywordQuery, setLastKeywordQuery] = useState('');
  const [selectedPaper, setSelectedPaper] = useState<ApiSearchResult | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

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

  const handleKeywordSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keywordQuery.trim();
    const atLeastOneFilter = researchChecked || grantsChecked || patentsChecked;

    if (!trimmed) {
      setKeywordError('Enter keywords to explore the literature feed.');
      setKeywordResults([]);
      setSelectedPaper(null);
      setLastKeywordQuery('');
      return;
    }

    if (!atLeastOneFilter) {
      setKeywordError('Select at least one source before searching.');
      setKeywordResults([]);
      setSelectedPaper(null);
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
        setSelectedPaper(null);
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
      setSelectedPaper(null);
    } finally {
      setKeywordLoading(false);
    }
  };

  return (
    <div className={SHELL_CLASSES}>
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-6 py-10">
        <div className="flex justify-end xl:hidden">
          <button
            type="button"
            onClick={() => setSidebarVisible((prev) => !prev)}
            aria-pressed={sidebarVisible}
            className={LAYOUT_TOGGLE_BUTTON_CLASSES}
          >
            {sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
          </button>
        </div>

        <div className="relative flex flex-col gap-6 xl:flex-row">
          <aside
            className={`relative ${sidebarVisible ? 'flex' : 'hidden'} flex-col transition-all duration-300 ease-in-out xl:flex xl:overflow-visible ${sidebarVisible ? 'xl:basis-[20%] xl:max-w-[20%]' : 'xl:basis-0 xl:max-w-[0%]'}`}
          >
            <div
              className={`${SIDEBAR_CARD_CLASSES} ${sidebarVisible ? '' : 'hidden'} xl:flex xl:transition-all xl:duration-300 xl:ease-out ${sidebarVisible ? 'xl:translate-x-0 xl:opacity-100' : 'xl:pointer-events-none xl:-translate-x-full xl:opacity-0'}`}
            >
              <div className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">Account</span>
                <h2 className="text-xl font-semibold text-slate-900">Your Library</h2>
              </div>
              <p className="text-sm text-slate-600">
                Sign in to save research you want to revisit. Once favourites launch, they’ll live here by category.
              </p>
              <div className="flex flex-col gap-3">
                <button type="button" className={SIDEBAR_PRIMARY_BUTTON_CLASSES}>
                  Log in
                </button>
                <button type="button" className={SIDEBAR_SECONDARY_BUTTON_CLASSES}>
                  Register
                </button>
              </div>
              <p className="text-xs text-slate-500">
                After we wire up the backend, your saved items will show up in custom categories in this sidebar.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSidebarVisible((prev) => !prev)}
              className="absolute top-1/2 right-[-18px] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 xl:flex"
              aria-label={sidebarVisible ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarVisible ? '<' : '>'}
            </button>
          </aside>

          <section
            className={`min-w-0 transition-all duration-300 ${sidebarVisible ? 'xl:basis-[40%]' : 'xl:basis-[50%]'} xl:grow-0 ${FEED_CARD_CLASSES}`}
          >
            <header className="flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">Synapse</span>
                <h1 className="text-3xl font-semibold text-slate-900">Research Feed</h1>
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
                    className={SEARCH_BUTTON_CLASSES}
                  >
                    Search
                  </button>
                </div>
              </form>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setResearchChecked((prev) => !prev)}
                  aria-pressed={researchChecked}
                  className={researchChecked ? FILTER_ACTIVE_CLASSES : FILTER_INACTIVE_CLASSES}
                >
                  Research
                </button>
                <span className={FILTER_DISABLED_CLASSES}>Grants</span>
                <span className={FILTER_DISABLED_CLASSES}>Patents</span>
              </div>
            </header>

            <div className="space-y-4">
              {lastKeywordQuery && !keywordError && (
                <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.25em] text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {lastKeywordQuery}
                  </span>
                  <span>
                    {keywordResults.length} result{keywordResults.length === 1 ? '' : 's'}
                  </span>
                </div>
              )}

              {keywordError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  {keywordError}
                </div>
              )}

              {keywordLoading ? (
                <div className="space-y-3">
                  <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-200/60 to-transparent animate-[shimmer_1.6s_infinite]" />
                    <div className="px-6 py-8">
                      <div className="h-5 w-1/3 rounded-full bg-slate-200/80" />
                      <div className="mt-4 h-4 w-2/3 rounded-full bg-slate-200/60" />
                      <div className="mt-3 h-3 w-1/2 rounded-full bg-slate-200/50" />
                    </div>
                  </div>
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
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
                  Start by searching for a topic above. You can drill into any result on the right-hand panel.
                </div>
              )}
            </div>
          </section>

          <aside
            className={`min-w-0 transition-all duration-300 ${sidebarVisible ? 'xl:basis-[40%]' : 'xl:basis-[50%]'} xl:grow-0 ${DETAIL_SHELL_CLASSES}`}
          >
            {selectedPaper ? (
              <div className="flex h-full flex-col gap-8">
                <div className={DETAIL_HERO_CLASSES}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-sky-600">Paper details</p>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-900">{selectedPaper.title}</h2>
                {metaSummary && (
                  <p className="mt-4 text-xs text-slate-600">{metaSummary}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {TILE_ACTIONS.map((action) => {
                  const actionClass = action.disabled ? ACTION_DISABLED_CLASSES : ACTION_ACTIVE_CLASSES

                  return (
                    <button
                      key={action.id}
                      type="button"
                      disabled={action.disabled}
                      className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold transition ${actionClass}`}
                      onClick={() => {
                        if (action.disabled) return
                        if (action.id === 'compile') {
                          setShowOnboarding(true)
                          return
                        }
                        console.log(`${action.label} clicked for`, selectedPaper.id)
                      }}
                    >
                      {action.icon && <span className="text-base">{action.icon}</span>}
                      <span>{action.label}</span>
                      {action.disabled && <span className="text-[10px] font-medium tracking-wide opacity-70">Soon</span>}
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

                <div className="space-y-2 text-xs text-slate-600">
                  {selectedPaper.doi && (
                    <p>
                      <strong className="font-semibold text-slate-700">DOI:</strong> {selectedPaper.doi}
                    </p>
                  )}
                  {selectedPaper.arxivId && (
                    <p>
                      <strong className="font-semibold text-slate-700">arXiv:</strong> {selectedPaper.arxivId}
                    </p>
                  )}
                  <p>
                    <strong className="font-semibold text-slate-700">Source:</strong> {selectedPaper.source.replace(/_/g, ' ')}
                  </p>
                </div>
              </section>

              <div className="mt-auto">
                {selectedPaper.url ? (
                  <a
                    href={selectedPaper.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={DETAIL_PRIMARY_BUTTON_CLASSES}
                  >
                    Open full paper
                  </a>
                ) : (
                  <p className="text-sm text-slate-500">
                    No external link available for this paper yet.
                  </p>
                )}
              </div>
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

      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <div
            className={ONBOARDING_SCRIM_CLASSES}
            onClick={() => setShowOnboarding(false)}
          />
          <div className={ONBOARDING_PANEL_CLASSES}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-sky-500">
                  Workflow preview
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  Compile related research
                </h2>
                <p className="mt-3 text-sm text-slate-600">
                  Soon you’ll be able to bundle this paper with supporting literature, export citations, and brief collaborators straight from Synapse.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowOnboarding(false)}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                aria-label="Close onboarding"
              >
                ×
              </button>
            </div>

            <div className="mt-6 space-y-4 text-sm">
              <div className={ONBOARDING_CARD_CLASSES}>
                <h3 className="text-sm font-semibold text-slate-800">1. Connect context</h3>
                <p className="mt-1 text-slate-600">
                  Link ORCID, personal sites, or upload bibliographies to map your research footprint.
                </p>
              </div>
              <div className={ONBOARDING_CARD_CLASSES}>
                <h3 className="text-sm font-semibold text-slate-800">2. Generate collections</h3>
                <p className="mt-1 text-slate-600">
                  We’ll cluster related works, surface pivotal citations, and keep the feed live.
                </p>
              </div>
              <div className={ONBOARDING_CARD_CLASSES}>
                <h3 className="text-sm font-semibold text-slate-800">3. Share effortlessly</h3>
                <p className="mt-1 text-slate-600">
                  Export to your reference manager or send tailored digests to collaborators.
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowOnboarding(false)}
                className={ONBOARDING_DISMISS_CLASSES}
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => setShowOnboarding(false)}
                className={ONBOARDING_PRIMARY_CLASSES}
              >
                Keep me posted
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
