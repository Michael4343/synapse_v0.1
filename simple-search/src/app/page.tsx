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
const TILE_ACTIONS = [
  { id: 'compile', short: 'Compile', label: 'Compile related research' },
  { id: 'favorite', short: 'Save', label: 'Favourite' },
  { id: 'like', short: 'Appreciate', label: 'Appreciate' },
  { id: 'share', short: 'Share', label: 'Share' },
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

  // Profile method states
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
  const [orcidId, setOrcidId] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [generatedProfile, setGeneratedProfile] = useState('');
  const [profileData, setProfileData] = useState<{
    sources: Array<{
      type: 'orcid' | 'website' | 'file';
      title: string;
      subtitle: string;
      status: 'success' | 'loading' | 'error';
      publications?: number;
      grants?: number;
      coAuthors?: number;
      icon: string;
    }>;
    summary: {
      totalSources: number;
      totalPublications: number;
      completeness: string;
      completenessScore: number;
    };
  } | null>(null);

  const handleKeywordSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keywordQuery.trim();
    const atLeastOneFilter = researchChecked || grantsChecked || patentsChecked;

    if (!trimmed) {
      setKeywordError('Enter keywords to explore the literature feed.');
      setKeywordResults([]);
      setLastKeywordQuery('');
      return;
    }

    if (!atLeastOneFilter) {
      setKeywordError('Select at least one source before searching.');
      setKeywordResults([]);
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
        return;
      }

      const payload = await response.json();
      const results = Array.isArray(payload.results) ? payload.results : [];
      setKeywordResults(results);
    } catch (error) {
      console.error('Keyword search failed', error);
      setKeywordError('We could not reach the search service. Please try again.');
      setKeywordResults([]);
    } finally {
      setKeywordLoading(false);
    }
  };

  const toggleMethod = (method: string) => {
    setSelectedMethods(prev =>
      prev.includes(method)
        ? prev.filter(m => m !== method)
        : [...prev, method]
    );
  };

  const handleOrcidSignIn = () => {
    setGeneratedProfile(`ORCID Sign-in initiated...\nWould redirect to ORCID OAuth flow\nPull: name, affiliations, works (DOIs), grants, co-authors\nEnrich via Crossref/OpenAlex using DOIs`);
  };

  const handleWebsiteExtraction = () => {
    if (websiteUrl.trim()) {
      setGeneratedProfile(`Website analysis for: ${websiteUrl}\n\nExtracting identifiers:\n- DOIs, PubMed IDs, arXiv IDs (regex patterns)\n- ORCID link if present\n- Schema.org JSON-LD parsing\n\nFetching metadata via Crossref/OpenAlex...`);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setGeneratedProfile(`BibTeX/RIS file uploaded: ${file.name}\n\nParsing file...\nExtracting DOIs/PMIDs\nEnriching via Crossref/OpenAlex\n\nTotal publications found: ${Math.floor(Math.random() * 50) + 10}`);
    }
  };

  const [profileSidebarOpen, setProfileSidebarOpen] = useState(false);

  const handleGenerateProfile = () => {
    const sources = [];
    let totalPublications = 0;

    if (selectedMethods.includes('orcid') && orcidId) {
      const publications = Math.floor(Math.random() * 30) + 15;
      const grants = Math.floor(Math.random() * 8) + 2;
      const coAuthors = Math.floor(Math.random() * 50) + 10;
      totalPublications += publications;

      sources.push({
        type: 'orcid' as const,
        title: 'ORCID Profile',
        subtitle: orcidId || 'Connected successfully',
        status: 'success' as const,
        publications,
        grants,
        coAuthors,
        icon: '🎓'
      });
    }

    if (selectedMethods.includes('website') && websiteUrl) {
      const publications = Math.floor(Math.random() * 20) + 8;
      totalPublications += publications;

      sources.push({
        type: 'website' as const,
        title: 'Personal Website',
        subtitle: websiteUrl,
        status: 'success' as const,
        publications,
        icon: '🌐'
      });
    }

    if (selectedMethods.includes('file') && uploadedFile) {
      const publications = Math.floor(Math.random() * 50) + 10;
      totalPublications += publications;

      sources.push({
        type: 'file' as const,
        title: 'Reference File',
        subtitle: uploadedFile.name,
        status: 'success' as const,
        publications,
        icon: '📄'
      });
    }

    if (sources.length > 0) {
      const completenessScore = sources.length === 3 ? 95 : sources.length === 2 ? 75 : 50;
      const completeness = sources.length === 3 ? 'Excellent!' : sources.length === 2 ? 'Good' : 'Basic';

      const profileData = {
        sources,
        summary: {
          totalSources: sources.length,
          totalPublications,
          completeness,
          completenessScore
        }
      };

      setProfileData(profileData);
      setGeneratedProfile(`Profile generated with ${sources.length} source${sources.length !== 1 ? 's' : ''}`);
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
                  {keywordResults.map((result) => (
                    <article
                      key={result.id}
                      className="group flex h-full flex-col justify-between rounded-2xl border border-blue-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
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
                            className="flex items-center justify-between rounded-xl border border-blue-200/70 bg-white px-4 py-2 text-xs font-semibold text-blue-800 shadow-[0px_4px_12px_rgba(59,130,246,0.15)] transition hover:-translate-y-0.5 hover:border-blue-300 hover:text-blue-900"
                            onClick={() => {
                              console.log(`${action.label} clicked for`, result.id)
                            }}
                          >
                            <span>{action.short}</span>
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium tracking-wide text-blue-600">
                              beta
                            </span>
                          </button>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : lastKeywordQuery ? (
                <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50 px-6 py-10 text-center text-sm text-blue-700">
                  No results yet. Try refining your keywords or toggling different filters.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Right Pane - Redesigned Profile Builder */}
        <div className="flex-1 bg-white p-6 shadow-sm overflow-y-auto">
          <div className="max-w-3xl mx-auto h-full flex flex-col">
            <div className="flex items-center justify-center mb-6">
              <div className="flex items-center space-x-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-white font-bold text-sm">
                  2
                </div>
                <h2 className="text-xl font-semibold text-gray-800">Profile Builder</h2>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-green-800">
                Connect your data sources for personalized recommendations.
              </p>
            </div>

            {/* Enhanced Profile Methods - Horizontal Cards */}
            <div className="space-y-4 mb-6 flex-1">
              {/* ORCID - Compact Horizontal */}
              <div className={`border-2 rounded-xl p-4 cursor-pointer transition-all duration-200 ${
                selectedMethods.includes('orcid') ? 'border-green-500 bg-green-50 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
              }`} onClick={() => toggleMethod('orcid')}>
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <span className="text-2xl">🎓</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <input
                        type="checkbox"
                        checked={selectedMethods.includes('orcid')}
                        onChange={() => toggleMethod('orcid')}
                        className="h-4 w-4 text-green-600"
                      />
                      <h3 className="font-semibold text-gray-800">ORCID</h3>
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">Recommended</span>
                    </div>
                    <p className="text-sm text-gray-600">Auto-import publications & grants</p>
                  </div>
                </div>
                {selectedMethods.includes('orcid') && (
                  <div className="mt-4 pt-4 border-t border-green-200 space-y-3">
                    <input
                      type="text"
                      value={orcidId}
                      onChange={(e) => setOrcidId(e.target.value)}
                      placeholder="0000-0000-0000-0000 (optional)"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <button
                      onClick={handleOrcidSignIn}
                      className="w-full px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                    >
                      Connect ORCID
                    </button>
                  </div>
                )}
              </div>

              {/* Website - Compact Horizontal */}
              <div className={`border-2 rounded-xl p-4 cursor-pointer transition-all duration-200 ${
                selectedMethods.includes('website') ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
              }`} onClick={() => toggleMethod('website')}>
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <span className="text-2xl">🌐</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <input
                        type="checkbox"
                        checked={selectedMethods.includes('website')}
                        onChange={() => toggleMethod('website')}
                        className="h-4 w-4 text-blue-600"
                      />
                      <h3 className="font-semibold text-gray-800">Personal Website</h3>
                    </div>
                    <p className="text-sm text-gray-600">Scan for publications automatically</p>
                  </div>
                </div>
                {selectedMethods.includes('website') && (
                  <div className="mt-4 pt-4 border-t border-blue-200 space-y-3">
                    <input
                      type="url"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://yourlab.edu/people/yourname"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleWebsiteExtraction}
                      disabled={!websiteUrl.trim()}
                      className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                    >
                      Scan Website
                    </button>
                  </div>
                )}
              </div>

              {/* File Upload - Compact Horizontal */}
              <div className={`border-2 rounded-xl p-4 cursor-pointer transition-all duration-200 ${
                selectedMethods.includes('file') ? 'border-purple-500 bg-purple-50 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
              }`} onClick={() => toggleMethod('file')}>
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                      <span className="text-2xl">📄</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <input
                        type="checkbox"
                        checked={selectedMethods.includes('file')}
                        onChange={() => toggleMethod('file')}
                        className="h-4 w-4 text-purple-600"
                      />
                      <h3 className="font-semibold text-gray-800">Upload Bibliography</h3>
                    </div>
                    <p className="text-sm text-gray-600">BibTeX, RIS from Zotero, EndNote</p>
                  </div>
                </div>
                {selectedMethods.includes('file') && (
                  <div className="mt-4 pt-4 border-t border-purple-200">
                    <input
                      type="file"
                      accept=".bib,.ris,.txt"
                      onChange={handleFileUpload}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    {uploadedFile && (
                      <p className="text-sm text-purple-600 mt-2 flex items-center space-x-1">
                        <span>✓</span>
                        <span>{uploadedFile.name}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Generate Button */}
            <div className="mt-auto">
              <button
                onClick={handleGenerateProfile}
                disabled={selectedMethods.length === 0}
                className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold rounded-xl hover:from-green-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 mb-4"
              >
                {selectedMethods.length === 0 ? 'Select Sources Above' : `Build Profile (${selectedMethods.length} source${selectedMethods.length !== 1 ? 's' : ''})`}
              </button>

              {/* Enhanced Profile Results */}
              {profileData && (
                <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-xl p-5 border-2 border-green-200 shadow-sm">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-bold">✓</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-green-800">Profile Ready!</h3>
                      <p className="text-xs text-green-600">{profileData.summary.totalPublications} publications • {profileData.summary.completenessScore}% complete</p>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    {profileData.sources.map((source, index) => (
                      <div key={index} className="bg-white rounded-lg p-3 border border-green-100 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className="text-lg">{source.icon}</span>
                            <div>
                              <div className="text-sm font-medium text-gray-700">{source.title}</div>
                              <div className="text-xs text-gray-500">{source.publications} publications</div>
                            </div>
                          </div>
                          <div className="text-green-500 text-lg">✓</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button className="w-full px-4 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors">
                    🚀 Launch Research Feed
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
