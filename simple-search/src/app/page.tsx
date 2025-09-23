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
  short: string
  label: string
  disabled?: boolean
}> = [
  { id: 'compile', short: 'Compile', label: 'Compile related research' },
  { id: 'favorite', short: 'Save', label: 'Favourite', disabled: true },
  { id: 'like', short: 'Appreciate', label: 'Appreciate', disabled: true },
  { id: 'share', short: 'Share', label: 'Share', disabled: true },
]

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      <main className="flex h-screen max-md:flex-col">
        {/* Left Pane - Research Feed */}
        <div className="flex-1 bg-white border-r border-gray-200 p-6 max-md:border-r-0 max-md:border-b shadow-sm overflow-y-auto">
        <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-center mb-6">
              <div className="flex items-center space-x-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-sm">
                  1
                </div>
                <h2 className="text-xl font-semibold text-gray-800">Research Feed</h2>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-blue-800">
                Search across academic databases to build your personalized research feed.
              </p>
            </div>

            {/* Search Form */}
            <form onSubmit={handleKeywordSearch} className="mb-6">
              <div className="relative">
                <input
                  type="text"
                  value={keywordQuery}
                  onChange={(e) => setKeywordQuery(e.target.value)}
                  placeholder="e.g., machine learning, cancer research..."
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  Search
                </button>
              </div>
            </form>

            {/* Filters */}
            <div className="mb-6">
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center bg-white rounded-lg px-3 py-2 shadow-sm cursor-pointer hover:shadow-md transition-shadow border border-gray-200">
                  <input
                    type="checkbox"
                    checked={researchChecked}
                    onChange={(e) => setResearchChecked(e.target.checked)}
                    className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-gray-700 font-medium text-sm">Research</span>
                </label>
                <label className="flex items-center bg-white rounded-lg px-3 py-2 shadow-sm transition-shadow border border-gray-200">
                  <input
                    type="checkbox"
                    checked={grantsChecked}
                    disabled
                    className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="flex flex-col">
                    <span className="text-gray-400 font-medium text-sm">Grants</span>
                    <span className="text-xs text-gray-400">Coming soon</span>
                  </div>
                </label>
                <label className="flex items-center bg-white rounded-lg px-3 py-2 shadow-sm transition-shadow border border-gray-200">
                  <input
                    type="checkbox"
                    checked={patentsChecked}
                    disabled
                    className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="flex flex-col">
                    <span className="text-gray-400 font-medium text-sm">Patents</span>
                    <span className="text-xs text-gray-400">Coming soon</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Results */}
            <div className="space-y-4">
              {lastKeywordQuery && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-blue-800">
                  <span>
                    Showing results for <span className="font-semibold">“{lastKeywordQuery}”</span>
                  </span>
                </div>
              )}

              {keywordError && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {keywordError}
                </div>
              )}

              {keywordLoading ? (
                <div className="space-y-3">
                  {FEED_SKELETON_ITEMS.map((_, index) => (
                    <div key={index} className="h-36 rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
                      <div className="h-6 w-3/4 animate-pulse rounded bg-blue-200" />
                      <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-blue-100" />
                      <div className="mt-4 h-3 w-1/2 animate-pulse rounded bg-slate-100" />
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
                        className={`group flex h-full cursor-pointer flex-col justify-between rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                          isSelected ? 'border-blue-400 ring-2 ring-blue-200' : 'border-blue-100'
                        }`}
                      >
                        <div>
                          <a
                            href={result.url ?? '#'}
                            target={result.url ? '_blank' : undefined}
                            rel={result.url ? 'noopener noreferrer' : undefined}
                            className="block text-base font-semibold text-blue-900 transition group-hover:text-blue-700"
                          >
                            {result.title}
                          </a>
                          <p className="mt-2 text-sm text-slate-600">{formatAuthors(result.authors)}</p>
                          {formatMeta(result) && (
                            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                              {formatMeta(result)}
                            </p>
                          )}
                          {/* Abstract hidden for list layout */}
                        </div>

                        <div className="mt-4 grid w-full gap-2 sm:grid-cols-2">
                          {TILE_ACTIONS.map((action) => (
                            <button
                              key={action.id}
                              type="button"
                              disabled={action.disabled}
                              className={`flex items-center justify-between rounded-xl border px-4 py-2 text-xs font-semibold shadow-[0px_4px_12px_rgba(59,130,246,0.15)] transition ${
                                action.disabled
                                  ? 'cursor-not-allowed border-blue-100 bg-blue-50 text-blue-300 shadow-none'
                                  : 'border-blue-200/70 bg-white text-blue-800 hover:-translate-y-0.5 hover:border-blue-300 hover:text-blue-900'
                              }`}
                              onClick={(event) => {
                                event.stopPropagation()
                                if (action.disabled) {
                                  return
                                }
                                setSelectedPaper(result)
                                if (action.id === 'compile') {
                                  setShowOnboarding(true)
                                  return
                                }
                                console.log(`${action.label} clicked for`, result.id)
                              }}
                            >
                              <span>{action.short}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide ${
                                action.disabled ? 'bg-blue-100 text-blue-400' : 'bg-blue-100 text-blue-600'
                              }`}>
                                {action.disabled ? 'soon' : 'beta'}
                              </span>
                            </button>
                          ))}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : lastKeywordQuery ? (
                <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50 px-6 py-10 text-center text-sm text-blue-700">
                  No results yet. Try refining your keywords or toggling different filters.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Right Pane - Paper Details */}
        <div className="flex-1 bg-white p-6 shadow-sm overflow-y-auto">
          <div className="max-w-3xl mx-auto h-full flex flex-col">
            {selectedPaper ? (
              <>
                <header className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Paper details</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">{selectedPaper.title}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {selectedPaper.venue && (
                      <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                        {selectedPaper.venue}
                      </span>
                    )}
                    {selectedPaper.year && (
                      <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                        {selectedPaper.year}
                      </span>
                    )}
                    {typeof selectedPaper.citationCount === 'number' && (
                      <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                        {selectedPaper.citationCount} citation{selectedPaper.citationCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </header>

                <div className="space-y-6">
                  <section>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Authors</h3>
                    <p className="mt-2 text-sm text-slate-700">
                      {selectedPaper.authors.length ? selectedPaper.authors.join(', ') : 'Author information unavailable.'}
                    </p>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Abstract</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {selectedPaper.abstract ?? 'Abstract not available for this entry.'}
                    </p>
                  </section>

                  <section className="flex flex-wrap gap-2 text-xs">
                    {selectedPaper.doi && (
                      <span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">
                        DOI: {selectedPaper.doi}
                      </span>
                    )}
                    {selectedPaper.arxivId && (
                      <span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">
                        arXiv: {selectedPaper.arxivId}
                      </span>
                    )}
                    <span className="rounded-full bg-blue-100 px-3 py-1 font-medium text-blue-700">
                      {selectedPaper.source.replace(/_/g, ' ')}
                    </span>
                  </section>
                </div>

                <div className="mt-auto pt-8">
                  {selectedPaper.url ? (
                    <a
                      href={selectedPaper.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                    >
                      Open full paper
                    </a>
                  ) : (
                    <p className="text-sm text-slate-500">No external link available for this paper yet.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
                <h2 className="text-lg font-semibold text-slate-700">No paper selected</h2>
                <p className="mt-2 max-w-sm text-sm">
                  Choose a result from the research feed to preview its abstract, authors and metadata here.
                </p>
              </div>
            )}
          </div>
        </div>

      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowOnboarding(false)}
          />
          <div className="relative z-10 w-full max-w-2xl rounded-3xl bg-white p-8 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-500">Workflow preview</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">Compile related research</h2>
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

            <div className="mt-6 space-y-4 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-700">1. Connect context</h3>
                <p className="mt-1">Link ORCID, personal sites, or upload bibliographies to map your research footprint.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-700">2. Generate collections</h3>
                <p className="mt-1">We’ll cluster related works, surface pivotal citations, and keep the feed live.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-700">3. Share effortlessly</h3>
                <p className="mt-1">Export to your reference manager or send tailored digests to collaborators.</p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowOnboarding(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => setShowOnboarding(false)}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Keep me posted
              </button>
            </div>
          </div>
        </div>
      )}

      </main>
    </div>
  );
}
