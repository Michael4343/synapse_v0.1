'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface SearchResult {
  id: string;
  title: string;
  authors: string[];
  source: string;
  date: string;
  abstract: string;
  url: string;
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const q = searchParams.get('q') || '';
    setQuery(q);
  }, [searchParams]);

  const mockResults: SearchResult[] = [
    {
      id: '1',
      title: 'Attention Is All You Need',
      authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar'],
      source: 'arXiv',
      date: '2017-06-12',
      abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...',
      url: 'https://arxiv.org/abs/1706.03762'
    },
    {
      id: '2',
      title: 'Deep Residual Learning for Image Recognition',
      authors: ['Kaiming He', 'Xiangyu Zhang', 'Shaoqing Ren'],
      source: 'arXiv',
      date: '2015-12-10',
      abstract: 'Deeper neural networks are more difficult to train. We present a residual learning framework...',
      url: 'https://arxiv.org/abs/1512.03385'
    }
  ];

  useEffect(() => {
    if (query) {
      setLoading(true);
      setError('');

      // Simulate API call delay
      setTimeout(() => {
        setResults(mockResults);
        setLoading(false);
      }, 1000);
    }
  }, [query]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-lg font-medium text-gray-900">
              ←
            </Link>

            {/* Search Bar */}
            <div className="flex-1">
              <form className="flex" onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const newQuery = formData.get('query') as string;
                if (newQuery?.trim()) {
                  window.location.href = `/search?q=${encodeURIComponent(newQuery.trim())}`;
                }
              }}>
                <input
                  type="text"
                  name="query"
                  key={query}
                  defaultValue={query}
                  placeholder="Search..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Search
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {!mounted ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-4">
              {!loading && results.length > 0 && `${results.length} results for "${query}"`}
            </p>
          </div>
        )}

        {mounted && (
          <>
            {/* Loading State */}
            {loading && (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="text-red-600 text-sm mb-6">
                {error}
              </div>
            )}

            {/* Results */}
            {!loading && results.length > 0 && (
              <div className="space-y-4">
                {results.map((result) => (
                  <div key={result.id} className="border-b border-gray-200 pb-4">
                    <h3 className="text-lg font-medium text-blue-600 hover:text-blue-800 mb-1">
                      <a href={result.url} target="_blank" rel="noopener noreferrer">
                        {result.title}
                      </a>
                    </h3>
                    <div className="text-sm text-gray-600 mb-2">
                      {result.authors.join(', ')} · {result.date}
                    </div>
                    <p className="text-gray-700 text-sm">
                      {result.abstract}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* No Results */}
            {!loading && results.length === 0 && query && (
              <div className="text-center py-12">
                <p className="text-gray-600">No results found</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white">
        <header className="border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center gap-8">
              <Link href="/" className="text-lg font-medium text-gray-900">
                ←
              </Link>
            </div>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        </main>
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}