'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogOut, Rss, User, UserCog, X, ArrowLeft, ChevronDown } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { usePostHogTracking } from '../hooks/usePostHogTracking';
import { useAuthModal, getUserDisplayName } from '../lib/auth-hooks';
import { createClient } from '../lib/supabase';
import { AuthModal } from '../components/auth-modal';
import { WelcomeModal } from '../components/welcome-modal';
import { OrcidSearchModal } from '../components/orcid-search-modal';
import { VerificationModal } from '../components/verification-modal';
import { OnboardingTutorial } from '../components/onboarding-tutorial';
import { TourPromptModal } from '../components/tour-prompt-modal';
import type { ProfilePersonalization, UserProfile } from '../lib/profile-types';
import { SaveToListModal } from '../components/save-to-list-modal';
import { buildVerifyListName, buildCompileListName, savePaperToNamedList } from '../lib/list-actions';
import type { ListPaperPayload } from '../lib/list-actions';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  getCachedData,
  setCachedData,
  clearCachedData,
  PERSONAL_FEED_CACHE_KEY,
  LIST_METADATA_CACHE_KEY,
  LIST_ITEMS_CACHE_KEY
} from '../lib/cache-utils';

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
  publicationDate: string | null
}

interface UserListSummary {
  id: number
  name: string
  items_count: number
  status?: 'loading' | 'ready'
}


interface PaperSection {
  type: string
  title: string
  content: string
}

interface ProcessedContent {
  title: string
  sections: PaperSection[]
  metadata: {
    processed_successfully: boolean
    content_quality: string
  }
}

type LifeSciencesMatrixRowKey =
  | 'sampleModel'
  | 'materialsRatios'
  | 'equipmentSetup'
  | 'procedureSteps'
  | 'controls'
  | 'outputsMetrics'
  | 'qualityChecks'
  | 'outcomeSummary';

const LIFE_SCIENCES_MATRIX_ROWS: Array<{ key: LifeSciencesMatrixRowKey; label: string }> = [
  { key: 'sampleModel', label: 'Sample and model' },
  { key: 'materialsRatios', label: 'Materials and ratios' },
  { key: 'equipmentSetup', label: 'Equipment setup' },
  { key: 'procedureSteps', label: 'Procedure steps' },
  { key: 'controls', label: 'Controls' },
  { key: 'outputsMetrics', label: 'Outputs and metrics' },
  { key: 'qualityChecks', label: 'Quality checks' },
  { key: 'outcomeSummary', label: 'Outcome summary' }
];

interface LifeSciencesMatrixRow {
  key: LifeSciencesMatrixRowKey;
  label: string;
  values: string[];
}

const buildLifeSciencesMatrixRows = (papers: CrosswalkDisplayPaper[]): LifeSciencesMatrixRow[] => {
  if (papers.length === 0) {
    return [];
  }

  return LIFE_SCIENCES_MATRIX_ROWS.map(row => ({
    key: row.key,
    label: row.label,
    values: papers.map(paper => paper.matrix[row.key] ?? 'Not reported')
  }));
};

interface RawMethodCrosswalkPaper {
  id: string;
  title: string;
  authors: string;
  venue: string;
  year: string;
  citationCount: number | null;
  clusterLabel: string;
  summary: string;
  highlight: string;
  matrix?: Partial<Record<LifeSciencesMatrixRowKey, string>>;
  semanticScholarId?: string | null;
  doi?: string | null;
  url?: string | null;
}

interface MethodFindingCrosswalkPayload {
  papers: RawMethodCrosswalkPaper[];
}

interface CrosswalkDisplayPaper {
  id: string;
  title: string;
  authors: string;
  venue: string;
  year: string;
  citationCount: number | null;
  clusterLabel: string;
  summary: string;
  highlight: string;
  matrix: Record<LifeSciencesMatrixRowKey, string>;
  semanticScholarId?: string | null;
  doi?: string | null;
  url?: string | null;
}

type SimilarPaperSaveState = {
  status: 'idle' | 'saving' | 'success' | 'already' | 'error';
  message?: string;
};

type SaveMatchStrategy =
  | 'paper-detail'
  | 'semantic-scholar-id'
  | 'semantic-scholar-doi'
  | 'semantic-scholar-url'
  | 'semantic-scholar-title'
  | 'semantic-scholar-first-result'
  | 'crosswalk-fallback';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const formatCitationCount = (count: number | null): string => {
  if (count === null) {
    return 'Citations not reported';
  }
  if (count === 1) {
    return '1 citation';
  }
  if (count === 0) {
    return '0 citations';
  }
  if (count >= 1000) {
    const formatted = (count / 1000).toFixed(count % 1000 === 0 ? 0 : 1).replace(/\.0$/, '');
    return `${formatted}k citations`;
  }
  return `${count.toLocaleString()} citations`;
};

const normaliseTitleForComparison = (title: string | null | undefined): string => {
  if (!title) {
    return '';
  }
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
};

const coerceAuthorsArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item): item is string => Boolean(item));
  }

  if (typeof value === 'string') {
    return value
      .split(/,|;| and | & /i)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const mapSearchResultToListPayload = (result: ApiSearchResult, sourceOverride?: string | null): ListPaperPayload => ({
  id: result.id,
  title: result.title,
  abstract: result.abstract,
  authors: coerceAuthorsArray(result.authors),
  year: result.year,
  venue: result.venue,
  citationCount: result.citationCount,
  semanticScholarId: result.semanticScholarId || null,
  arxivId: result.arxivId ?? null,
  doi: result.doi ?? null,
  url: result.url ?? null,
  source: sourceOverride ?? result.source ?? null,
  publicationDate: result.publicationDate ?? null,
});

const mapPaperDetailToSearchResult = (paper: any): ApiSearchResult | null => {
  if (!paper || typeof paper !== 'object') {
    return null;
  }

  const authors = coerceAuthorsArray((paper as Record<string, unknown>).authors);
  const title = typeof paper.title === 'string' ? paper.title : '';
  if (!title) {
    return null;
  }

  const year = typeof paper.year === 'number' ? paper.year : Number.isFinite(Number(paper.year)) ? Number(paper.year) : null;

  return {
    id: String(paper.id ?? ''),
    title,
    abstract: typeof paper.abstract === 'string' ? paper.abstract : null,
    authors,
    year: Number.isFinite(year) ? (year as number) : null,
    venue: typeof paper.venue === 'string' ? paper.venue : null,
    citationCount: typeof paper.citation_count === 'number' ? paper.citation_count : null,
    semanticScholarId: typeof paper.semantic_scholar_id === 'string' ? paper.semantic_scholar_id : '',
    arxivId: typeof paper.arxiv_id === 'string' ? paper.arxiv_id : null,
    doi: typeof paper.doi === 'string' ? paper.doi : null,
    url: typeof paper.url === 'string' ? paper.url : null,
    source: typeof paper.source_api === 'string' ? paper.source_api : 'paper_detail',
    publicationDate: typeof paper.publication_date === 'string' ? paper.publication_date : null,
  };
};

const mapRawSearchResult = (raw: any): ApiSearchResult | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const title = typeof raw.title === 'string' ? raw.title : '';
  if (!title) {
    return null;
  }

  return {
    id: typeof raw.id === 'string' ? raw.id : String(raw.id ?? ''),
    title,
    abstract: typeof raw.abstract === 'string' ? raw.abstract : null,
    authors: coerceAuthorsArray(raw.authors),
    year: typeof raw.year === 'number' ? raw.year : null,
    venue: typeof raw.venue === 'string' ? raw.venue : null,
    citationCount: typeof raw.citationCount === 'number' ? raw.citationCount : null,
    semanticScholarId: typeof raw.semanticScholarId === 'string' ? raw.semanticScholarId : '',
    arxivId: typeof raw.arxivId === 'string' ? raw.arxivId : null,
    doi: typeof raw.doi === 'string' ? raw.doi : null,
    url: typeof raw.url === 'string' ? raw.url : null,
    source: typeof raw.source === 'string' ? raw.source : 'semantic_scholar',
    publicationDate: typeof raw.publicationDate === 'string' ? raw.publicationDate : null,
  };
};

const convertListPayloadToDisplayItem = (payload: ListPaperPayload): ApiSearchResult => ({
  id: payload.id,
  title: payload.title,
  abstract: payload.abstract ?? null,
  authors: coerceAuthorsArray(payload.authors),
  year: typeof payload.year === 'number' ? payload.year : null,
  venue: typeof payload.venue === 'string' ? payload.venue : null,
  citationCount: typeof payload.citationCount === 'number' ? payload.citationCount : null,
  semanticScholarId: payload.semanticScholarId ?? '',
  arxivId: payload.arxivId ?? null,
  doi: payload.doi ?? null,
  url: payload.url ?? null,
  source: payload.source ?? 'method_crosswalk',
  publicationDate: payload.publicationDate ?? null,
});

interface ResolvedSimilarPaper {
  listPayload: ListPaperPayload;
  displayItem: ApiSearchResult;
  matchStrategy: SaveMatchStrategy;
}

const buildFallbackSaveArtifacts = (crosswalkPaper: CrosswalkDisplayPaper, basePaperId: string): ResolvedSimilarPaper => {
  const fallbackId = `crosswalk:${basePaperId}:${crosswalkPaper.id}`;
  const yearNumber = Number.parseInt(crosswalkPaper.year, 10);
  const citationCount = typeof crosswalkPaper.citationCount === 'number'
    ? crosswalkPaper.citationCount
    : Number.isFinite(Number(crosswalkPaper.citationCount))
      ? Number(crosswalkPaper.citationCount)
      : null;

  const authors = coerceAuthorsArray(crosswalkPaper.authors);

  const listPayload: ListPaperPayload = {
    id: fallbackId,
    title: crosswalkPaper.title,
    abstract: crosswalkPaper.summary,
    authors,
    year: Number.isFinite(yearNumber) ? yearNumber : null,
    venue: crosswalkPaper.venue,
    citationCount,
    semanticScholarId: crosswalkPaper.semanticScholarId ?? null,
    arxivId: null,
    doi: crosswalkPaper.doi ?? null,
    url: crosswalkPaper.url ?? null,
    source: 'method_crosswalk',
    publicationDate: Number.isFinite(yearNumber) ? `${yearNumber}-01-01` : null,
  };

  return {
    listPayload,
    displayItem: convertListPayloadToDisplayItem(listPayload),
    matchStrategy: 'crosswalk-fallback',
  };
};

const fetchPaperDetailAsSearchResult = async (paperId: string): Promise<ApiSearchResult | null> => {
  try {
    const response = await fetch(`/api/papers/${paperId}`);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return mapPaperDetailToSearchResult(data);
  } catch (error) {
    console.error('Failed to fetch paper detail for save:', error);
    return null;
  }
};

const searchSemanticScholarForCrosswalk = async (
  crosswalkPaper: CrosswalkDisplayPaper
): Promise<{ result: ApiSearchResult | null; strategy: SaveMatchStrategy | null }> => {
  const body: Record<string, unknown> = {
    query: crosswalkPaper.title,
    limit: 5,
  };

  const parsedYear = Number.parseInt(crosswalkPaper.year, 10);
  if (!Number.isNaN(parsedYear)) {
    body.year = parsedYear;
  }

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return { result: null, strategy: null };
    }

    const payload = await response.json();
    const rawResults = Array.isArray(payload?.results) ? payload.results : [];
    const normalisedResults = rawResults
      .map(mapRawSearchResult)
      .filter((item): item is ApiSearchResult => Boolean(item));

    if (!normalisedResults.length) {
      return { result: null, strategy: null };
    }

    const normalisedTitle = normaliseTitleForComparison(crosswalkPaper.title);

    const bySemanticScholarId = crosswalkPaper.semanticScholarId
      ? normalisedResults.find((result) => result.semanticScholarId && result.semanticScholarId === crosswalkPaper.semanticScholarId)
      : null;
    if (bySemanticScholarId) {
      return { result: bySemanticScholarId, strategy: 'semantic-scholar-id' };
    }

    const byDoi = crosswalkPaper.doi
      ? normalisedResults.find((result) => result.doi && result.doi.toLowerCase() === crosswalkPaper.doi?.toLowerCase())
      : null;
    if (byDoi) {
      return { result: byDoi, strategy: 'semantic-scholar-doi' };
    }

    const byUrl = crosswalkPaper.url
      ? normalisedResults.find((result) => result.url && result.url.toLowerCase() === crosswalkPaper.url?.toLowerCase())
      : null;
    if (byUrl) {
      return { result: byUrl, strategy: 'semantic-scholar-url' };
    }

    const byTitle = normalisedResults.find((result) => normaliseTitleForComparison(result.title) === normalisedTitle);
    if (byTitle) {
      return { result: byTitle, strategy: 'semantic-scholar-title' };
    }

    return { result: normalisedResults[0], strategy: 'semantic-scholar-first-result' };
  } catch (error) {
    console.error('Semantic Scholar search failed for crosswalk save:', error);
    return { result: null, strategy: null };
  }
};

const resolveCrosswalkPaperForSave = async (
  crosswalkPaper: CrosswalkDisplayPaper,
  basePaperId: string
): Promise<ResolvedSimilarPaper> => {
  if (UUID_REGEX.test(crosswalkPaper.id)) {
    const detail = await fetchPaperDetailAsSearchResult(crosswalkPaper.id);
    if (detail) {
      return {
        listPayload: mapSearchResultToListPayload(detail),
        displayItem: detail,
        matchStrategy: 'paper-detail',
      };
    }
  }

  const { result, strategy } = await searchSemanticScholarForCrosswalk(crosswalkPaper);
  if (result) {
    return {
      listPayload: mapSearchResultToListPayload(result),
      displayItem: result,
      matchStrategy: strategy ?? 'semantic-scholar-first-result',
    };
  }

  return buildFallbackSaveArtifacts(crosswalkPaper, basePaperId);
};

interface CrosswalkMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: LifeSciencesMatrixRow[];
  papers: CrosswalkDisplayPaper[];
}

function CrosswalkMatrixModal({ isOpen, onClose, rows, papers }: CrosswalkMatrixModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.35)]">
        <div className="flex flex-shrink-0 items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Method &amp; Finding Crosswalk</h3>
            <p className="mt-1 text-sm text-slate-500">Full comparison across all research dimensions.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          >
            <span className="sr-only">Close</span>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No structured comparison is available for these papers yet.
            </div>
          ) : (
            <table className="min-w-full text-left">
              <thead className="sticky top-0 bg-white text-xs font-medium text-slate-500 shadow-[0_1px_0_rgba(15,23,42,0.08)]">
                <tr>
                  <th className="w-56 px-6 py-3 text-left uppercase tracking-wide text-slate-500">Research focus</th>
                  {papers.map(paper => (
                    <th
                      key={paper.id}
                      className="min-w-[240px] max-w-[320px] px-4 py-3 text-left text-slate-600"
                      title={paper.title}
                    >
                      <span className="block whitespace-pre-wrap text-sm font-semibold leading-snug text-slate-800">
                        {paper.title}
                      </span>
                      <span className="mt-1 block text-xs uppercase tracking-wide text-slate-400">{paper.year}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm text-slate-700">
                {rows.map((row, rowIndex) => (
                  <tr key={row.key} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                    <th className="align-top px-6 py-4 text-sm font-semibold text-slate-900">
                      <span className="block whitespace-pre-wrap leading-snug">{row.label}</span>
                    </th>
                    {papers.map((paper, paperIndex) => {
                      const value = row.values[paperIndex] ?? 'Not reported';
                      const isMissing = !value || value === 'Not reported';

                      return (
                        <td key={paper.id} className="align-top px-4 py-4 text-sm leading-relaxed text-slate-700">
                          {isMissing ? (
                            <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                              Not reported
                            </span>
                          ) : (
                            <span className="block whitespace-pre-wrap leading-snug">{value}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

type VerificationRequestType = 'combined';
type VerificationTrack = 'reproducibility' | 'paper' | 'similar';

interface ResearchPaperAnalysis {
  stage: string;
  lastUpdated: string;
  reviewers: string[];
  summary: string;
  paper: {
    title: string;
    authors: string;
    venue: string;
    doi?: string;
  };
  feasibilityQuestions?: Array<{
    id: string;
    question: string;
    weight: number;
    helper?: string;
  }>;
  evidence: {
    strong: Array<{
      claim: string;
      source: string;
      confidence?: string;
      notes?: string;
    }>;
    gaps: Array<{
      description: string;
      impact: string;
      severity: string;
      needsExpert?: boolean;
    }>;
    assumptions: string[];
  };
}

function buildVerificationPayloadFromSearchResult(paper: ApiSearchResult) {
  return {
    id: paper.id,
    title: paper.title,
    authors: paper.authors,
    abstract: paper.abstract,
    year: paper.year,
    venue: paper.venue,
    citation_count: paper.citationCount,
    doi: paper.doi,
    url: paper.url,
    scraped_url: null,
    content_quality: null,
    content_type: null
  };
}

const FEED_SKELETON_ITEMS = Array.from({ length: 6 })

function adaptReproducibilityReport(raw: unknown, paper: ApiSearchResult | null): ResearchPaperAnalysis | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  if ('summary' in raw && 'feasibilityQuestions' in raw) {
    return raw as ResearchPaperAnalysis;
  }

  const overallVerdict = typeof (raw as { overallVerdict?: unknown }).overallVerdict === 'string'
    ? (raw as { overallVerdict: string }).overallVerdict
    : null;

  const feasibilitySnapshot = Array.isArray((raw as { feasibilitySnapshot?: unknown }).feasibilitySnapshot)
    ? ((raw as { feasibilitySnapshot: Array<{ question?: string; whyItMatters?: string }> }).feasibilitySnapshot)
    : [];

  if (!overallVerdict && feasibilitySnapshot.length === 0) {
    return null;
  }

  const questions = feasibilitySnapshot.map((item, index) => ({
    id: `capability-${index + 1}`,
    question: typeof item?.question === 'string' && item.question.trim().length > 0
      ? item.question
      : 'Capability check not provided',
    weight: 1,
    helper: typeof item?.whyItMatters === 'string' && item.whyItMatters.trim().length > 0
      ? item.whyItMatters
      : undefined
  }));

  return {
    stage: 'analysis_ready',
    lastUpdated: new Date().toISOString(),
    reviewers: [],
    summary: overallVerdict ?? 'Reproducibility assessment pending.',
    paper: {
      title: paper?.title ?? 'Selected paper',
      authors: paper ? paper.authors.join(', ') : 'Not reported',
      venue: paper?.venue ?? 'Not reported',
      doi: paper?.doi ?? undefined
    },
    feasibilityQuestions: questions,
    evidence: {
      strong: [],
      gaps: [],
      assumptions: []
    }
  };
}

// Sample papers to show in default feed
const SAMPLE_PAPERS: ApiSearchResult[] = [
  {
    id: '68d962effe5520777791bd6ec8ffa4b963ba4f38',
    title: 'A Programmable Dual-RNA–Guided DNA Endonuclease in Adaptive Bacterial Immunity',
    abstract: 'The RNA-guided Cas9 nuclease from the microbial clustered regularly interspaced short palindromic repeats (CRISPR) adaptive immune system can be used to facilitate efficient genome engineering in eukaryotic cells by simply specifying a 20-nucleotide targeting sequence within its guide RNA. We describe a set of tools for Cas9-mediated genome editing via non-homologous end joining or homology-directed repair in mammalian cells, demonstrating that this system enables RNA-programmed genome editing with multiplexed and high-throughput capability.',
    authors: ['M. Jinek', 'Krzysztof Chylinski', 'Ines Fonfara', 'Michael H. Hauer', 'J. Doudna', 'E. Charpentier'],
    year: 2012,
    venue: 'Science',
    citationCount: 14227,
    semanticScholarId: '68d962effe5520777791bd6ec8ffa4b963ba4f38',
    arxivId: null,
    doi: '10.1126/science.1225829',
    url: 'https://www.semanticscholar.org/paper/68d962effe5520777791bd6ec8ffa4b963ba4f38',
    source: 'semantic_scholar',
    publicationDate: '2012-08-17'
  },
  {
    id: 'abd1c342495432171beb7ca8fd9551ef13cbd0ff',
    title: 'ImageNet Classification with Deep Convolutional Neural Networks',
    abstract: 'We trained a large, deep convolutional neural network to classify the 1.2 million high-resolution images in the ImageNet LSVRC-2010 contest into the 1000 different classes. On the test data, we achieved top-1 and top-5 error rates of 37.5% and 17.0% which is considerably better than the previous state-of-the-art. The neural network, which has 60 million parameters and 650,000 neurons, consists of five convolutional layers, some of which are followed by max-pooling layers, and three fully-connected layers with a final 1000-way softmax.',
    authors: ['A. Krizhevsky', 'I. Sutskever', 'Geoffrey E. Hinton'],
    year: 2012,
    venue: 'Communications of the ACM',
    citationCount: 122474,
    semanticScholarId: 'abd1c342495432171beb7ca8fd9551ef13cbd0ff',
    arxivId: null,
    doi: '10.1145/3065386',
    url: 'https://www.semanticscholar.org/paper/abd1c342495432171beb7ca8fd9551ef13cbd0ff',
    source: 'semantic_scholar',
    publicationDate: '2012-12-03'
  },
  {
    id: 'c92bd747a97eeafdb164985b0d044caa1dc6e73e',
    title: 'Electric Field Effect in Atomically Thin Carbon Films',
    abstract: 'We describe monocrystalline graphitic films, which are a few atoms thick but are nonetheless stable under ambient conditions, metallic, and of remarkably high quality. The films are found to be a two-dimensional semimetal with a tiny overlap between valence and conductance bands, and they exhibit a strong ambipolar electric field effect such that electrons and holes in concentrations up to 1013 per square centimeter and with room-temperature mobilities of ~10,000 square centimeters per volt-second can be induced by applying gate voltage.',
    authors: ['K. Novoselov', 'A.K. Geim', 'S. Morozov', 'D. Jiang', 'Y. Zhang', 'S. Dubonos', 'I. Grigorieva', 'A. Firsov'],
    year: 2004,
    venue: 'Science',
    citationCount: 57311,
    semanticScholarId: 'c92bd747a97eeafdb164985b0d044caa1dc6e73e',
    arxivId: 'cond-mat/0410550',
    doi: '10.1126/science.1102896',
    url: 'https://www.semanticscholar.org/paper/c92bd747a97eeafdb164985b0d044caa1dc6e73e',
    source: 'semantic_scholar',
    publicationDate: '2004-10-21'
  }
]

const SAMPLE_METHOD_FINDING_CROSSWALK: Record<string, MethodFindingCrosswalkPayload> = {
  '68d962effe5520777791bd6ec8ffa4b963ba4f38': {
    papers: [
      {
        id: 'crispr-lab-methods',
        title: 'Cas9 delivery toolkits across mammalian systems',
        authors: 'Cong et al.',
        venue: 'Nature Methods',
        year: '2013',
        citationCount: 4500,
        clusterLabel: 'Sample and model',
        summary: 'Shares side-by-side procedures for introducing Cas9 into mammalian cells using materials and steps a university lab can source.',
        highlight: 'Signal from abstract: contrasts plasmid and ribonucleoprotein delivery in mammalian cells',
        matrix: {
          sampleModel: 'Primary mammalian cells and induced pluripotent stem cell lines.',
          materialsRatios: 'Cas9 protein, guide RNA, and delivery carrier balanced at bench scale.',
          equipmentSetup: 'Standard biosafety cabinet, incubator, and electroporation or lipid delivery rigs.',
          procedureSteps: 'Prepare guides, mix with carrier, deliver to cells, incubate, assess editing.',
          controls: 'Non-targeting guides and untreated cells to check off-target cuts.',
          outputsMetrics: 'Editing efficiency measured by sequencing and enzyme mismatch assays.',
          qualityChecks: 'Guide validation and enzyme activity checks before delivery.',
          outcomeSummary: 'Confirms that ribonucleoprotein delivery improves precision in common lab settings.'
        }
      },
      {
        id: 'crispr-pilot-studies',
        title: 'Pre-clinical CRISPR programmes moving toward the clinic',
        authors: 'Smith et al.',
        venue: 'Nature Biotechnology',
        year: '2015',
        citationCount: 820,
        clusterLabel: 'Field deployments',
        summary: 'Documents how translational teams adapt the core Cas9 workflow for animal studies with practical handling and monitoring steps.',
        highlight: 'Signal from abstract: outlines immune monitoring during in vivo Cas9 delivery',
        matrix: {
          sampleModel: 'Mouse disease models and primary tissue explants.',
          materialsRatios: 'Guide RNA and vector doses scaled for animal body mass.',
          equipmentSetup: 'Animal housing rooms, viral production benches, and histology suites.',
          procedureSteps: 'Package vector, deliver to animal, monitor, harvest tissues, profile edits.',
          controls: 'Vehicle-only injections and sham procedures to anchor outcome comparisons.',
          outputsMetrics: 'Editing rates, protein expression, and safety panels recorded per cohort.',
          qualityChecks: 'Serology and histology checkpoints to flag immune responses.',
          outcomeSummary: 'Provides a practical runbook for pre-clinical teams replicating Cas9 studies.'
        }
      },
      {
        id: 'crispr-theory-grounding',
        title: 'Governance and reproducibility frameworks for gene editing',
        authors: 'Baltimore et al.',
        venue: 'Science Policy Forum',
        year: '2015',
        citationCount: 360,
        clusterLabel: 'Insight primers',
        summary: 'Summarises reproducibility checklists and reporting templates that emerged as labs scaled CRISPR studies.',
        highlight: 'Signal from editorial or summary in Science Policy Forum',
        matrix: {
          sampleModel: 'Policy review drawing on human cell and animal case studies.',
          materialsRatios: 'Not reported.',
          equipmentSetup: 'Not reported.',
          procedureSteps: 'Collect community standards, compile checklists, publish guidance.',
          controls: 'Not reported.',
          outputsMetrics: 'Adoption of standard operating procedures across labs.',
          qualityChecks: 'Peer-reviewed reproducibility checklists and disclosure templates.',
          outcomeSummary: 'Offers practical governance steps to support repeatable gene editing work.'
        }
      }
    ]
  },
  abd1c342495432171beb7ca8fd9551ef13cbd0ff: {
    papers: [
      {
        id: 'alexnet-architecture-evolution',
        title: 'From AlexNet to deeper convolutional stacks',
        authors: 'Simonyan & Zisserman',
        venue: 'ICLR',
        year: '2014',
        citationCount: 9500,
        clusterLabel: 'Sample and model',
        summary: 'Breaks down layer layouts, activation choices, and training routines that build directly on the ImageNet reference pipeline.',
        highlight: 'Signal from abstract: details deeper stacks improving ImageNet accuracy',
        matrix: {
          sampleModel: 'ImageNet training and validation splits prepared for convolutional nets.',
          materialsRatios: 'Convolutional layer widths and depths balanced for single GPU memory.',
          equipmentSetup: 'Single and multi-GPU nodes with CUDA acceleration.',
          procedureSteps: 'Stage data, configure network, train with SGD, evaluate top-1 and top-5 accuracy.',
          controls: 'Baseline AlexNet configuration rerun for comparison.',
          outputsMetrics: 'Top-1 and top-5 accuracy tracked per epoch.',
          qualityChecks: 'Learning curve monitoring and gradient norm checks.',
          outcomeSummary: 'Shows how deeper but efficient stacks replicate and extend AlexNet results.'
        }
      },
      {
        id: 'alexnet-systems-optimisation',
        title: 'Systems engineering for large-scale vision models',
        authors: 'Jia et al.',
        venue: 'NIPS Workshop',
        year: '2014',
        citationCount: 410,
        clusterLabel: 'Field deployments',
        summary: 'Documents the practical data pipelines, mixed-precision training, and kernel fusion tactics used to keep runs stable.',
        highlight: 'Signal from abstract: reports throughput gains from mixed-precision pipelines',
        matrix: {
          sampleModel: 'Image classification workloads across large image corpora.',
          materialsRatios: 'Mini-batch sizes tuned to memory bandwidth on commodity GPUs.',
          equipmentSetup: 'Distributed GPU clusters with fast storage and pre-fetch queues.',
          procedureSteps: 'Shard data, spin up loaders, train with mixed precision, log metrics.',
          controls: 'Single-node training sessions to benchmark improvements.',
          outputsMetrics: 'Training time per epoch and accuracy parity checks.',
          qualityChecks: 'Gradient overflow guards and checksum validation on sharded batches.',
          outcomeSummary: 'Provides a checklist for engineering teams reproducing ImageNet-scale runs.'
        }
      },
      {
        id: 'alexnet-transfer-primers',
        title: 'Transfer and fine-tuning strategies after ImageNet',
        authors: 'Donahue et al.',
        venue: 'CVPR',
        year: '2014',
        citationCount: 5200,
        clusterLabel: 'Insight primers',
        summary: 'Explains how to fine-tune ImageNet backbones for downstream tasks using straightforward schedules.',
        highlight: 'Signal from abstract: notes best-practice fine-tuning schedules for new tasks',
        matrix: {
          sampleModel: 'ImageNet pre-trained networks adapted to varied vision datasets.',
          materialsRatios: 'Learning rate and weight decay schedules tuned for transfer.',
          equipmentSetup: 'Single GPU workstations with standard deep learning frameworks.',
          procedureSteps: 'Initialise with pre-trained weights, freeze early layers, fine-tune heads, run evaluation.',
          controls: 'Randomly initialised models trained with identical schedules.',
          outputsMetrics: 'Accuracy and loss on downstream validation sets.',
          qualityChecks: 'Overfitting checks through validation gap monitoring.',
          outcomeSummary: 'Gives practitioners a direct recipe for fine-tuning legacy ImageNet models.'
        }
      }
    ]
  },
  c92bd747a97eeafdb164985b0d044caa1dc6e73e: {
    papers: [
      {
        id: 'graphene-production-basics',
        title: 'Scaling graphene exfoliation and growth',
        authors: 'Li et al.',
        venue: 'Science',
        year: '2009',
        citationCount: 2100,
        clusterLabel: 'Sample and model',
        summary: 'Lays out furnace settings and substrate preparation steps to reproduce wafer-scale graphene films.',
        highlight: 'Signal from abstract: sets chemical vapour deposition conditions for graphene films',
        matrix: {
          sampleModel: 'Copper and nickel substrates prepared for graphene growth.',
          materialsRatios: 'Methane and hydrogen flows balanced for monolayer formation.',
          equipmentSetup: 'Tube furnace with gas flow controllers and vacuum pumps.',
          procedureSteps: 'Clean substrate, anneal, introduce gas mix, cool under inert flow.',
          controls: 'Blank substrate runs to confirm no graphite residue.',
          outputsMetrics: 'Layer thickness checked by Raman spectroscopy and microscopy.',
          qualityChecks: 'Gas composition monitoring and furnace temperature calibration.',
          outcomeSummary: 'Shows how labs can reproduce high-quality graphene sheets with standard furnaces.'
        }
      },
      {
        id: 'graphene-characterisation',
        title: 'Quantifying electronic behaviour in 2D carbon',
        authors: 'Zhang et al.',
        venue: 'Nature Physics',
        year: '2005',
        citationCount: 5600,
        clusterLabel: 'Field deployments',
        summary: 'Provides step-by-step measurement routines for mobility, carrier type, and quantum Hall signatures.',
        highlight: 'Signal from abstract: details magnetotransport measurements for graphene samples',
        matrix: {
          sampleModel: 'Few-layer graphene devices patterned on insulating substrates.',
          materialsRatios: 'Electrode metals deposited with nanometre thickness control.',
          equipmentSetup: 'Cryostat, magnet, and low-noise electrical measurement stack.',
          procedureSteps: 'Pattern device, wire bond, cool sample, sweep field, record resistance.',
          controls: 'Reference samples with known mobility for calibration.',
          outputsMetrics: 'Sheet resistance and Hall plateaus plotted against field strength.',
          qualityChecks: 'Contact resistance checks and instrument calibration before each run.',
          outcomeSummary: 'Gives reproducible measurement steps for graphene transport studies.'
        }
      },
      {
        id: 'graphene-application-primers',
        title: 'Device concepts leveraging graphene properties',
        authors: 'Schedin et al.',
        venue: 'Nature Materials',
        year: '2007',
        citationCount: 3200,
        clusterLabel: 'Insight primers',
        summary: 'Highlights straightforward device fabrication steps for sensors and flexible electronics built on graphene films.',
        highlight: 'Signal from abstract: describes gas sensing and flexible electrode demonstrations',
        matrix: {
          sampleModel: 'Graphene films transferred onto flexible and rigid substrates.',
          materialsRatios: 'Polymer support films and etchants balanced for clean transfer.',
          equipmentSetup: 'Spin coater, vacuum oven, and standard photolithography line.',
          procedureSteps: 'Grow graphene, transfer to substrate, pattern electrodes, package device.',
          controls: 'Reference devices without graphene layer to baseline response.',
          outputsMetrics: 'Sensor response curves and sheet resistance trends.',
          qualityChecks: 'Optical inspection and Raman checks after transfer.',
          outcomeSummary: 'Provides a pragmatic blueprint for reproducing early graphene devices.'
        }
      }
    ]
  }
};

const SAMPLE_PAPER_IDS = new Set(SAMPLE_PAPERS.map(paper => paper.id))

function isSamplePaperId(id: string | null | undefined): boolean {
  if (!id) {
    return false
  }
  return id.startsWith('sample-') || SAMPLE_PAPER_IDS.has(id)
}

const AEST_OFFSET_MINUTES = 10 * 60
const AEST_OFFSET_MS = AEST_OFFSET_MINUTES * 60 * 1000
const PERSONAL_FEED_LABEL = 'Personal Feed'

function toAest(date: Date): Date {
  return new Date(date.getTime() + AEST_OFFSET_MS)
}

// Determine the next time (in UTC) that the scheduled 9am AEST refresh should run
function getNextPersonalFeedRunUtc(lastRun: Date): Date {
  const lastRunAest = toAest(lastRun)

  const year = lastRunAest.getUTCFullYear()
  const month = lastRunAest.getUTCMonth()
  const day = lastRunAest.getUTCDate()

  const sameDayNineAmAest = new Date(Date.UTC(year, month, day, 9, 0, 0))
  const msSinceMidnight =
    lastRunAest.getUTCHours() * 3_600_000 +
    lastRunAest.getUTCMinutes() * 60_000 +
    lastRunAest.getUTCSeconds() * 1_000 +
    lastRunAest.getUTCMilliseconds()

  const nineAmMs = 9 * 3_600_000

  if (msSinceMidnight >= nineAmMs) {
    sameDayNineAmAest.setUTCDate(sameDayNineAmAest.getUTCDate() + 1)
  }

  return new Date(sameDayNineAmAest.getTime() - AEST_OFFSET_MS)
}

// Decide whether the personal feed needs a fresh search based on the scheduling rules
function shouldRunScheduledPersonalFeed(lastUpdatedIso: string | null | undefined): boolean {
  if (!lastUpdatedIso) {
    return true
  }

  const lastUpdated = new Date(lastUpdatedIso)
  if (Number.isNaN(lastUpdated.getTime())) {
    return true
  }

  const nextRunUtc = getNextPersonalFeedRunUtc(lastUpdated)
  return Date.now() >= nextRunUtc.getTime()
}

function getSectionIcon(type: string): string {
  return ''
}

function PaperSection({ section }: { section: PaperSection }) {
  return (
    <section className="border-b border-slate-200 last:border-b-0 pb-4 last:pb-0">
      <h4 className="text-lg font-semibold text-slate-800 mb-3">
        {section.title}
      </h4>
      <div className="prose prose-slate prose-sm max-w-none prose-headings:text-slate-800 prose-h4:text-base prose-h5:text-sm prose-h6:text-xs prose-p:text-slate-700 prose-p:leading-relaxed prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-code:text-slate-800 prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-50 prose-pre:border prose-pre:border-slate-200 prose-blockquote:border-l-blue-500 prose-blockquote:bg-blue-50 prose-blockquote:py-2 prose-blockquote:px-3 prose-strong:text-slate-800 prose-em:text-slate-700">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {section.content}
        </ReactMarkdown>
      </div>
    </section>
  )
}

function ProcessedPaperContent({ processedContent }: { processedContent: string }) {
  try {
    const parsed: ProcessedContent = JSON.parse(processedContent)

    if (!parsed.sections || !Array.isArray(parsed.sections)) {
      throw new Error('Invalid section structure')
    }

    const validSections = parsed.sections.filter(section => section.content && section.content.trim().length > 0)

    if (validSections.length === 0) {
      throw new Error('No valid sections with content')
    }

    return (
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-4">Full Paper</h3>
        <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-200">
          {validSections.map((section, index) => (
            <div key={index} className="p-4">
              <PaperSection section={section} />
            </div>
          ))}
        </div>
      </div>
    )
  } catch (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <p className="text-sm text-amber-700">
          Unable to parse structured content. Falling back to raw content display.
        </p>
        <details className="mt-2">
          <summary className="text-xs cursor-pointer">Debug Info</summary>
          <pre className="mt-2 text-xs bg-white p-2 rounded overflow-auto max-h-32">
            Error: {error instanceof Error ? error.message : String(error)}
            {'\n'}
            Content: {processedContent?.slice(0, 300)}...
          </pre>
        </details>
      </div>
    )
  }
}

interface VerificationRequestRecord {
  id: string
  paper_id: string | null
  paper_lookup_id: string
  user_id: string | null
  verification_type: 'claims' | 'reproducibility' | 'combined'
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  created_at: string
  updated_at: string
  completed_at: string | null
  result_summary: unknown
  request_payload: unknown
  similar_papers_data: unknown
}

interface CommunityReviewRequestRecord {
  id: string
  paper_id: string | null
  paper_lookup_id: string
  user_id: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  request_payload: unknown
  created_at: string
  updated_at: string
}

interface VerificationSummaryPayload {
  requests: VerificationRequestRecord[]
  communityReviewRequests: CommunityReviewRequestRecord[]
  reproducibilityReport: unknown
  methodFindingCrosswalk: MethodFindingCrosswalkPayload | null
}

const SHELL_CLASSES = 'min-h-screen bg-slate-50 text-slate-900 flex flex-col xl:h-screen xl:overflow-hidden';
const FEED_CARD_CLASSES = 'flex h-full min-h-0 flex-col space-y-6 px-2 pt-4 pb-12 xl:px-4 xl:pb-16';
const DETAIL_SHELL_CLASSES = 'flex h-full min-h-0 flex-col space-y-6 px-2 pt-4 pb-12 xl:px-4 xl:pb-16';
const DETAIL_HERO_CLASSES = 'rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-4 shadow-inner';
const TILE_BASE_CLASSES = 'group relative flex cursor-pointer flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 transition duration-150 hover:border-slate-300 hover:bg-slate-50 xl:max-h-[400px] xl:overflow-y-auto';
const TILE_SELECTED_CLASSES = 'border-sky-400 bg-sky-100 ring-2 ring-sky-300 shadow-sm';
const FEED_LOADING_WRAPPER_CLASSES = 'relative flex flex-col gap-3';
const FEED_SPINNER_CLASSES = 'inline-block h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent';
const FEED_LOADING_PILL_CLASSES = 'inline-flex items-center gap-2 self-start rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-600 shadow-sm';
const SEARCH_CONTAINER_CLASSES = 'relative flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:gap-0 sm:p-0 sm:overflow-hidden';
const SEARCH_INPUT_CLASSES = 'w-full bg-transparent px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none sm:px-5 sm:py-3.5';
const SEARCH_BUTTON_CLASSES = 'inline-flex w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-sky-400 sm:w-auto';
const SEARCH_YEAR_INPUT_CLASSES = 'w-full bg-transparent px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-100 sm:w-24 sm:px-3 sm:py-3.5 sm:text-center sm:focus:ring-0';
const FILTER_BAR_CLASSES = 'flex flex-wrap gap-2 pt-4';
const FILTER_CHECKBOX_LABEL_CLASSES = 'inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 whitespace-nowrap';
const FILTER_CHECKBOX_DISABLED_LABEL_CLASSES = 'inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-400 opacity-80 cursor-not-allowed whitespace-nowrap';
const FILTER_CHECKBOX_INPUT_CLASSES = 'h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500';
const FILTER_CHECKBOX_INPUT_DISABLED_CLASSES = 'text-slate-300 focus:ring-0';
const RESULT_SUMMARY_CLASSES = 'flex flex-wrap items-baseline gap-2 text-sm text-slate-600';
const DETAIL_METADATA_CLASSES = 'space-y-3 text-sm text-slate-600';
const DETAIL_LINK_CLASSES = 'text-lg font-semibold text-sky-600 underline decoration-sky-300 underline-offset-4 transition hover:text-sky-700';
const TILE_LINK_CLASSES = 'inline-flex items-center text-xs font-semibold text-sky-600 underline decoration-sky-300 underline-offset-4 transition hover:text-sky-700';
const SIDEBAR_CARD_CLASSES = 'flex flex-col gap-6 px-2 pt-4 pb-10 xl:px-3 xl:pt-6 xl:pb-12';
const SIDEBAR_PRIMARY_BUTTON_CLASSES = 'flex w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(56,189,248,0.2)] transition hover:-translate-y-0.5 hover:bg-sky-400 sm:w-auto';
const SIDEBAR_SECONDARY_BUTTON_CLASSES = 'flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:w-auto';
const SEARCH_SPINNER_CLASSES = 'inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent';
const DETAIL_SAVE_BUTTON_CLASSES = 'inline-flex w-full items-center justify-center rounded-lg border border-sky-200 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-sky-700 transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 sm:w-auto sm:px-8';
const DETAIL_REPRO_BUTTON_CLASSES = 'inline-flex w-full items-center justify-center rounded-lg border border-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-sky-700 transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 sm:w-auto';
const DETAIL_SIMILAR_BUTTON_CLASSES = 'inline-flex w-full items-center justify-center rounded-lg border border-emerald-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 sm:w-auto';
const DETAIL_VERIFY_BUTTON_ACTIVE_CLASSES = 'border-sky-400 bg-sky-50 text-sky-900 shadow-[0_12px_28px_rgba(56,189,248,0.25)] ring-2 ring-offset-2 ring-sky-200';
const DETAIL_SIMILAR_BUTTON_ACTIVE_CLASSES = 'border-emerald-400 bg-emerald-50 text-emerald-900 shadow-[0_12px_28px_rgba(16,185,129,0.25)] ring-2 ring-offset-2 ring-emerald-200';
const DETAIL_PATENT_BUTTON_CLASSES = 'inline-flex w-full items-center justify-center rounded-lg border border-slate-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 bg-white cursor-not-allowed opacity-60 sm:w-auto';
const DETAIL_COMMUNITY_BUTTON_CLASSES = 'inline-flex w-full items-center justify-center rounded-lg border border-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-sky-700 transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto';
const PROFILE_CARD_CLASSES = 'rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_25px_60px_rgba(15,23,42,0.08)]';
const ACCOUNT_ICON_BUTTON_CLASSES = 'inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900';
const PROFILE_LABEL_CLASSES = 'text-sm font-medium text-slate-700';
const PROFILE_INPUT_CLASSES = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100';
const PROFILE_PRIMARY_BUTTON_CLASSES = 'inline-flex w-full items-center justify-center rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto';
const PROFILE_COMING_SOON_HINT_CLASSES = 'text-xs font-medium text-slate-400';
const PROFILE_DISABLED_UPLOAD_BUTTON_CLASSES = 'flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed sm:w-auto';

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const RELATIVE_TIME_DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' }
];

function formatRelativeTime(timestamp: string | null | undefined): string {
  if (!timestamp) {
    return 'Unknown';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return 'Just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  const diffWeeks = Math.round(diffDays / 7);
  if (diffWeeks < 5) {
    return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;
  }

  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
  }

  const diffYears = Math.round(diffDays / 365);
  return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`;
}

function formatRelativePublicationDate(publicationDate: string | null): string | null {
  if (!publicationDate) return null;

  const publishedAt = new Date(publicationDate);
  if (Number.isNaN(publishedAt.getTime())) return null;

  let durationInSeconds = (publishedAt.getTime() - Date.now()) / 1000;

  for (const division of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(durationInSeconds) < division.amount) {
      return RELATIVE_TIME_FORMATTER.format(Math.round(durationInSeconds), division.unit);
    }
    durationInSeconds /= division.amount;
  }

  return null;
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

  const relativePublication = formatRelativePublicationDate(result.publicationDate)
  if (relativePublication) {
    items.push(relativePublication)
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

function filterByRecency(papers: ApiSearchResult[], days: number): ApiSearchResult[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return papers.filter(paper =>
    paper.publicationDate && new Date(paper.publicationDate) >= cutoff
  );
}

function getFeasibilitySummary(score: number): string {
  if (score >= 80) {
    return 'Ready to execute';
  }
  if (score >= 55) {
    return 'Needs targeted support';
  }
  return 'High risk';
}

function getFeasibilityTone(score: number): string {
  if (score >= 80) {
    return 'text-emerald-600';
  }
  if (score >= 55) {
    return 'text-amber-600';
  }
  return 'text-red-600';
}

function parseManualKeywords(input: string) {
  return input
    .split(/[\n,]/)
    .map(value => value.trim())
    .filter(value => value.length > 0)
    .slice(0, 20);
}

function formatOrcidId(input: string): string {
  const clean = input.replace(/[^0-9X]/gi, '').toUpperCase();
  if (clean.length === 0) return '';
  const limited = clean.slice(0, 16);
  return limited.replace(/(.{4})/g, '$1-').replace(/-$/, '');
}

function normalizeOrcidId(input: string): string {
  return input.replace(/[^0-9X]/gi, '').toUpperCase();
}

function validateOrcidId(input: string): { isValid: boolean; message?: string } {
  const normalized = normalizeOrcidId(input);

  if (normalized.length === 0) {
    return { isValid: false, message: 'ORCID ID is required' };
  }

  if (normalized.length < 16) {
    return { isValid: false, message: 'ORCID ID must be 16 characters long' };
  }

  if (normalized.length > 16) {
    return { isValid: false, message: 'ORCID ID is too long' };
  }

  return { isValid: true };
}


const VERIFICATION_DATA: Record<string, ResearchPaperAnalysis> = {
  '68d962effe5520777791bd6ec8ffa4b963ba4f38': {
    stage: 'ai_research',
    lastUpdated: '2025-02-10',
    reviewers: ['AI Research Desk'],
    summary: 'Highly reproducible for well-equipped molecular biology labs. Main challenge is capital investment and specialised expertise for multi-step Cas9 protein purification.',
    paper: {
      title: 'A Programmable Dual-RNA–Guided DNA Endonuclease in Adaptive Bacterial Immunity',
      authors: 'Jinek et al.',
      venue: 'Science (2012)',
      doi: '10.1126/science.1225829'
    },
    feasibilityQuestions: [
      { id: 'models', question: 'Do you maintain human iPSC-derived neurons or comparable VCP disease models?', weight: 3, helper: 'Authors relied on patient-derived cortical neurons; organoids are acceptable with baseline QC.' },
      { id: 'imaging', question: 'Can you run high-content imaging or time-lapse microscopy for autophagy flux?', weight: 2, helper: 'Needed to quantify LC3, SQSTM1, and aggregate clearance across dosing windows.' },
      { id: 'assays', question: 'Do you have validated autophagy and proteasome activity assays ready to deploy?', weight: 2, helper: 'Study used paired LC3-II westerns, proteasome-Glo readouts, and ubiquitin clearance panels.' },
      { id: 'compounds', question: 'Can you source or synthesise the VCP activator compound panel described?', weight: 2, helper: 'Lead molecules ship from two specialised vendors; analog synthesis support may be required.' },
      { id: 'compliance', question: 'Are your approvals for patient-derived cell handling current and traceable?', weight: 1, helper: 'Requires IRB amendments plus cold-chain documentation for neuron stocks.' }
    ],
    evidence: {
      strong: [
        { claim: 'VCP-874 boosted autophagic flux by 45% in patient-derived neurons.', source: 'Supplementary Figure 4', confidence: 'verified' },
        { claim: 'Proteasome-Glo assays showed 1.6× activity recovery after 24-hour dosing.', source: 'Main Figure 3C and methods', confidence: 'inferred', notes: 'Raw luminescence tables include positive controls for cross-checking.' }
      ],
      gaps: [
        { description: 'Large-scale Cas9 purification not benchmarked.', impact: 'Scale-up to GMP lots remains uncertain without pilot runs.', severity: 'moderate', needsExpert: true },
        { description: 'Long-term dosing cytotoxicity not reported.', impact: 'Chronic treatment risk requires toxicology follow-up.', severity: 'critical', needsExpert: true }
      ],
      assumptions: [
        'Cas9 reagents or expression systems are already validated in-house.',
        'Neuron culture workflows operate at BSL-2 with documented sterility.',
        'Analytical HPLC/MS capacity is available for compound QC.'
      ]
    }
  },
  abd1c342495432171beb7ca8fd9551ef13cbd0ff: {
    stage: 'ai_research',
    lastUpdated: '2025-01-22',
    reviewers: ['ML Scale Desk'],
    summary: 'Moderately reproducible if you have deterministic data pipelines and multi-GPU training capacity. Main challenge is aligning legacy augmentation schedules with modern frameworks.',
    paper: {
      title: 'ImageNet Classification with Deep Convolutional Neural Networks',
      authors: 'Krizhevsky, Sutskever, Hinton',
      venue: 'Communications of the ACM (2017)',
      doi: '10.1145/3065386'
    },
    feasibilityQuestions: [
      { id: 'gpu', question: 'Do you control at least two 24GB GPUs or equivalent cloud instances for multi-week training?', weight: 3, helper: 'Original experiments ran on dual GTX 580s; modern replications use A6000/H100-class hardware for parity.' },
      { id: 'dataset', question: 'Is your team comfortable rebuilding the ImageNet ingestion pipeline with deterministic preprocessing?', weight: 2, helper: 'Consistent crop, flip, and colour jitter policies are required to hit the reported accuracy.' },
      { id: 'kernels', question: 'Can you maintain or emulate the legacy CUDA/cuDNN kernels referenced in the paper?', weight: 2, helper: 'Contemporary frameworks hide some details but still require precise cuDNN versions or equivalent fused kernels.' },
      { id: 'ops', question: 'Do you have telemetry to monitor throughput, loss curves, and gradient spikes during long runs?', weight: 1, helper: 'Helps catch divergence early when reproducing the baseline schedule.' }
    ],
    evidence: {
      strong: [
        { claim: 'Modern PyTorch reference implementations reach within 1% Top-5 accuracy when augmentations match the original schedule.', source: 'torchvision.models AlexNet reproduction notes', confidence: 'verified' },
        { claim: 'Deterministic data loaders reduce variance across random seeds.', source: 'Fast.ai ImageNet replication forum threads', confidence: 'inferred' }
      ],
      gaps: [
        { description: 'Exact per-device random seed usage is undocumented.', impact: 'Accuracy can fluctuate by >1% without aligned RNG streams.', severity: 'moderate', needsExpert: true },
        { description: 'Legacy CUDA kernels cited in the paper are unmaintained.', impact: 'Teams must port to modern frameworks or backport drivers to reproduce raw throughput.', severity: 'critical', needsExpert: true }
      ],
      assumptions: [
        'Cloud interruptions are avoided by reserving dedicated GPU capacity.',
        'Baseline reproduction targets FP32 parity before attempting mixed precision.',
        'Restarts are automated with checkpoint and LR schedule recovery.'
      ]
    }
  },
  c92bd747a97eeafdb164985b0d044caa1dc6e73e: {
    stage: 'human_review',
    lastUpdated: '2024-11-18',
    reviewers: ['Materials Repro Desk'],
    summary: 'Highly reproducible for nanofabrication labs with clean-room access. Main challenge is maintaining single-layer graphene quality during transfer and device patterning.',
    paper: {
      title: 'Electric Field Effect in Atomically Thin Carbon Films',
      authors: 'Novoselov et al.',
      venue: 'Science (2004)',
      doi: '10.1126/science.1102896'
    },
    feasibilityQuestions: [
      { id: 'substrate', question: 'Do you have a proven workflow for mechanical exfoliation or CVD transfer onto SiO₂/Si substrates?', weight: 3, helper: 'The mobility metrics rely on defect-free monolayers adhered to 300 nm SiO₂.' },
      { id: 'patterning', question: 'Can you pattern sub-micron Hall bar geometries with e-beam or high-resolution photolithography?', weight: 2, helper: 'Device geometry strongly influences carrier mobility; edge roughness degrades performance.' },
      { id: 'anneal', question: 'Do you operate an inert-atmosphere anneal step for residue removal?', weight: 2, helper: 'Annealing in forming gas or argon is necessary to recover carrier mobility after lithography.' },
      { id: 'metrology', question: 'Is Raman/AFM metrology available to confirm monolayer thickness and strain?', weight: 1, helper: 'Spectra confirm the G and 2D peaks; AFM ensures the transfer avoided wrinkles.' }
    ],
    evidence: {
      strong: [
        { claim: 'Independent labs have reproduced mobility >10,000 cm²/Vs with similar exfoliation workflows.', source: 'Tombros et al., Nature Physics 2007', confidence: 'verified' },
        { claim: 'Forming-gas anneals restore graphene transport after lithography residues.', source: 'Ishigami et al., Nano Letters 2007', confidence: 'inferred' }
      ],
      gaps: [
        { description: 'Long-term device stability under ambient storage is not documented.', impact: 'Mobility can degrade within days without encapsulation.', severity: 'moderate', needsExpert: false },
        { description: 'Transfer yield statistics are omitted.', impact: 'Planning wafer-scale experiments is difficult without yield baselines.', severity: 'critical', needsExpert: true }
      ],
      assumptions: [
        'Class 1000 clean-room access with e-beam lithography is available.',
        'Thermal evaporators support Cr/Au deposition.',
        'Raman spectroscopy is calibrated for graphene signatures.'
      ]
    }
  }
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function StaticReproReport({
  report
}: {
  report: ResearchPaperAnalysis;
}) {
  const questions = useMemo(
    () => (Array.isArray(report.feasibilityQuestions) ? report.feasibilityQuestions : []),
    [report.feasibilityQuestions]
  );

  const [answers, setAnswers] = useState<Record<string, 'yes' | 'no' | null>>(() => {
    const initial: Record<string, 'yes' | 'no' | null> = {};
    questions.forEach((question) => {
      initial[question.id] = null;
    });
    return initial;
  });

  const totalWeight = useMemo(() => questions.reduce((sum, question) => sum + question.weight, 0), [questions]);
  const yesWeight = useMemo(
    () => questions.reduce((sum, question) => sum + (answers[question.id] === 'yes' ? question.weight : 0), 0),
    [answers, questions]
  );

  const feasibilityScore = totalWeight > 0 ? Math.round((yesWeight / totalWeight) * 100) : 0;
  const feasibilitySummary = getFeasibilitySummary(feasibilityScore);
  const feasibilityTone = getFeasibilityTone(feasibilityScore);

  function handleAnswer(questionId: string, response: 'yes' | 'no') {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: prev[questionId] === response ? null : response
    }));
  }

  const isPlaceholder = questions.length === 0;

  if (isPlaceholder) {
    return (
      <div className="space-y-6" data-tutorial="repro-overview">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{report.summary}</h3>
            <p className="mt-1 text-sm text-slate-600">{report.paper.title}</p>
            <p className="text-xs text-slate-500">{report.paper.authors} | {report.paper.venue}</p>
          </div>
        </section>
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-sm font-medium text-amber-900">
            Detailed reproducibility analysis coming soon
          </p>
          <p className="mt-2 text-xs text-amber-700">
            Feasibility questions and expert insights will be added for this paper.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-tutorial="repro-overview">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{report.summary}</h3>
          <p className="mt-1 text-xs text-slate-500">Updated {formatRelativeTime(report.lastUpdated)} · {report.reviewers.join(', ')}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h4 className="text-base font-semibold text-slate-900">Feasibility snapshot</h4>
            <p className="mt-1 text-sm text-slate-600">Mark what your lab already has in place.</p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-semibold ${feasibilityTone}`}>{feasibilityScore}<span className="ml-1 text-base text-slate-500">%</span></p>
            <p className="text-xs text-slate-500">{feasibilitySummary}</p>
          </div>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
          <div
            className={`h-2 rounded-full transition-all ${feasibilityScore >= 80 ? 'bg-emerald-500' : feasibilityScore >= 55 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${feasibilityScore}%` }}
          />
        </div>
        <div className="mt-4 space-y-3">
          {questions.map((question) => {
            const currentAnswer = answers[question.id];
            return (
              <div key={question.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{question.question}</p>
                  {question.helper ? <p className="mt-1 text-xs text-slate-500">{question.helper}</p> : null}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleAnswer(question.id, 'yes')}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${currentAnswer === 'yes' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-600'}`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAnswer(question.id, 'no')}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${currentAnswer === 'no' ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:text-red-600'}`}
                  >
                    Not yet
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  const { user, loading, signOut } = useAuth();
  const authModal = useAuthModal();
  const { trackEvent, trackError } = usePostHogTracking();

  const [keywordQuery, setKeywordQuery] = useState('');
  const [yearQuery, setYearQuery] = useState('');
  const [researchChecked, setResearchChecked] = useState(true);
  const [patentsChecked, setPatentsChecked] = useState(false);
  const [communityChecked, setCommunityChecked] = useState(false);
  const [keywordResults, setKeywordResults] = useState<ApiSearchResult[]>([]);
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [keywordError, setKeywordError] = useState('');
  const [lastKeywordQuery, setLastKeywordQuery] = useState('');
  const [lastYearQuery, setLastYearQuery] = useState<number | null>(null);
  const [resultOffset, setResultOffset] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<ApiSearchResult | null>(null);
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
  const [websiteScrapingLoading, setWebsiteScrapingLoading] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [paperToSave, setPaperToSave] = useState<ApiSearchResult | null>(null);
  const [similarPaperSaveState, setSimilarPaperSaveState] = useState<Record<string, SimilarPaperSaveState>>({});
  const [userLists, setUserLists] = useState<UserListSummary[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [listItems, setListItems] = useState<ApiSearchResult[]>([]);
  const [listItemsLoading, setListItemsLoading] = useState(false);
  const [listItemsLoadingMessage, setListItemsLoadingMessage] = useState('');
  const [cachedListItems, setCachedListItems] = useState<Map<number, ApiSearchResult[]>>(new Map());
  const [profileEditorVisible, setProfileEditorVisible] = useState(false);
  const [profileSaveLoading, setProfileSaveLoading] = useState(false);
  const [accountDropdownVisible, setAccountDropdownVisible] = useState(false);
  const [scrapedContent, setScrapedContent] = useState<string | null>(null);
  const [scrapedContentLoading, setScrapedContentLoading] = useState(false);
  const [scrapedContentError, setScrapedContentError] = useState('');
  const [scrapedContentIsStructured, setScrapedContentIsStructured] = useState(false);
  const [verificationView, setVerificationView] = useState<VerificationTrack>('paper');
  const [paperViewMemory, setPaperViewMemory] = useState<Map<string, VerificationTrack>>(new Map());
  const [feedPopulating, setFeedPopulating] = useState(false);
  const [verificationSummary, setVerificationSummary] = useState<VerificationSummaryPayload | null>(null);
  const [verificationSummaryLoading, setVerificationSummaryLoading] = useState(false);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [verificationRequestStatus, setVerificationRequestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [verificationRequestError, setVerificationRequestError] = useState('');
  const [activeVerificationRequestType, setActiveVerificationRequestType] = useState<VerificationRequestType | null>(null);
  const [communityReviewStatus, setCommunityReviewStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [communityReviewError, setCommunityReviewError] = useState('');
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showOrcidSearchModal, setShowOrcidSearchModal] = useState(false);
  const [showTourPrompt, setShowTourPrompt] = useState(false);
  const [hasSeenInitialAuth, setHasSeenInitialAuth] = useState(false);
  const [openCrosswalkRowKey, setOpenCrosswalkRowKey] =
    useState<LifeSciencesMatrixRowKey | null>(null);
  const [isCrosswalkModalOpen, setIsCrosswalkModalOpen] = useState(false);

  const profileManualKeywordsRef = useRef('');
  const isMountedRef = useRef(true);
  const initialAuthPromptedRef = useRef(false);
  const accountDropdownRef = useRef<HTMLDivElement | null>(null);
  const feedPollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const feedPollCountRef = useRef(0);
  const feedLastResultCountRef = useRef(0);
  const feedStableCountRef = useRef(0);
  const hasSetFirstPaperRef = useRef(false);
  const feedObservedChangeRef = useRef(false);
  const feedLastUpdatedRef = useRef<string | null>(null);
  const paperViewStartTimeRef = useRef<number | null>(null);
  const previousPaperRef = useRef<ApiSearchResult | null>(null);
  const feedBaselineRecordedRef = useRef(false);
  const personalFeedInitializedRef = useRef(false);
  const orcidAutoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastAutoSavedOrcidRef = useRef<string>('');

  useEffect(() => {
    if (!accountDropdownVisible) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!accountDropdownRef.current) {
        return;
      }

      if (!accountDropdownRef.current.contains(event.target as Node)) {
        setAccountDropdownVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [accountDropdownVisible]);

  useEffect(() => {
    profileManualKeywordsRef.current = profileManualKeywords;
  }, [profileManualKeywords]);

  useEffect(() => {
    if (selectedPaper) {
      const savedView = paperViewMemory.get(selectedPaper.id);
      setVerificationView(savedView || 'paper');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPaper]);

  useEffect(() => {
    setSimilarPaperSaveState({});
  }, [selectedPaper?.id]);

  useEffect(() => {
    if (!user) {
      // Reset account dropdown when user logs out
      setAccountDropdownVisible(false);
    }
  }, [user]);

  // Auto-save ORCID when a valid ID is entered (handles both typing and autofill)
  useEffect(() => {
    // Clear any existing timer
    if (orcidAutoSaveTimerRef.current) {
      clearTimeout(orcidAutoSaveTimerRef.current);
      orcidAutoSaveTimerRef.current = null;
    }

    const trimmedOrcid = profileFormOrcid.trim();

    // Only auto-save if:
    // 1. User is logged in
    // 2. ORCID is not empty
    // 3. ORCID is valid
    // 4. ORCID hasn't been auto-saved already
    // 5. Not currently loading
    if (!user || !trimmedOrcid || profileEnrichmentLoading) {
      return;
    }

    const orcidValidation = validateOrcidId(trimmedOrcid);
    if (!orcidValidation.isValid) {
      return;
    }

    const normalizedOrcid = normalizeOrcidId(trimmedOrcid);

    // Don't auto-save if we already auto-saved this exact ORCID
    if (normalizedOrcid === lastAutoSavedOrcidRef.current) {
      return;
    }

    // Set a timer to auto-save after 1.5 seconds of no changes
    orcidAutoSaveTimerRef.current = setTimeout(() => {
      lastAutoSavedOrcidRef.current = normalizedOrcid;
      handleOrcidSave();
    }, 1500);

    // Cleanup function
    return () => {
      if (orcidAutoSaveTimerRef.current) {
        clearTimeout(orcidAutoSaveTimerRef.current);
        orcidAutoSaveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileFormOrcid, user, profileEnrichmentLoading]);

  // Removed getAuthHeaders - now inlined to avoid dependency issues

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Show auth modal once auth state has resolved; first-time visitors default to signup
  useEffect(() => {
    if (initialAuthPromptedRef.current || loading) {
      return;
    }

    if (user || authModal.isOpen) {
      initialAuthPromptedRef.current = true;
      return;
    }

    const hasSeenAuth = localStorage.getItem('evidentia_seen_initial_auth') === 'true';
    initialAuthPromptedRef.current = true;

    const timer = setTimeout(() => {
      if (hasSeenAuth) {
        authModal.openLogin();
      } else {
        authModal.openSignup();
        setHasSeenInitialAuth(true);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [authModal.isOpen, authModal.openLogin, authModal.openSignup, loading, user]);

  // Legacy tutorial logic (kept for backward compatibility)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const tutorialCompleted = localStorage.getItem('evidentia_tutorial_completed');
    const hasSeenAuth = localStorage.getItem('evidentia_seen_initial_auth');

    // Only auto-show tutorial if they've already seen the auth flow
    if (!tutorialCompleted && !user && hasSeenAuth && !tutorialOpen && !showTourPrompt) {
      // Auto-select CRISPR paper for demo
      setSelectedPaper(SAMPLE_PAPERS[0]);
      setVerificationView('paper');
    }
  }, [user]);

  // Track time spent viewing papers
  useEffect(() => {
    const previousPaper = previousPaperRef.current;
    const currentPaper = selectedPaper;

    // If we had a previous paper and it's different from current, track time spent
    if (previousPaper && previousPaper.id !== currentPaper?.id && paperViewStartTimeRef.current) {
      const durationMs = Date.now() - paperViewStartTimeRef.current;
      const durationSeconds = Math.round(durationMs / 1000);

      // Only track if user spent at least 3 seconds viewing the paper
      if (durationSeconds >= 3) {
        trackEvent({
          name: 'paper_time_spent',
          properties: {
            duration_seconds: durationSeconds,
            paper_id: previousPaper.id,
            paper_title: previousPaper.title,
            source: previousPaper.source,
          },
        });
      }
    }

    // Update refs for next change
    previousPaperRef.current = currentPaper;
    paperViewStartTimeRef.current = currentPaper ? Date.now() : null;
  }, [selectedPaper, trackEvent]);

  const fetchUserLists = useCallback(async (force = false) => {
    if (!user) return;

    const listCacheKey = `${LIST_METADATA_CACHE_KEY}-${user.id}`;

    // Check for cached data first
    if (!force) {
      const cachedLists = getCachedData<UserListSummary[]>(listCacheKey);
      if (cachedLists) {
        setUserLists(cachedLists);
        return; // Use cached data
      }
    }

    setListsLoading(true);
    try {
      // Simple fetch - no auth headers needed since we're authenticated
      const response = await fetch('/api/lists');

      if (response.ok) {
        const data = await response.json();
        const lists = Array.isArray(data.lists) ? data.lists : [];

        const readyLists: UserListSummary[] = lists.map((list: any) => ({
          id: list.id,
          name: list.name,
          items_count: typeof list.items_count === 'number' ? list.items_count : 0,
          status: 'ready' as const,
        }));

        // Cache the successful result
        setCachedData(listCacheKey, readyLists);
        setUserLists(readyLists);
      }
    } catch (error) {
      console.error('Failed to fetch user lists:', error);
    } finally {
      setListsLoading(false);
    }
  }, [user]);

  const fetchListItems = useCallback(async (listId: number, force = false) => {
    if (!user) return;

    const listItemsCacheKey = `${LIST_ITEMS_CACHE_KEY}-${user.id}-${listId}`;

    // Check if we have cached items for this list first
    if (!force) {
      const cachedItems = cachedListItems.get(listId);
      if (cachedItems) {
        setListItems(cachedItems);
        if (cachedItems.length > 0) {
          setSelectedPaper(cachedItems[0]);
        }
        return; // Use cached data instantly
      }

      // Also check localStorage cache
      const localCachedItems = getCachedData<ApiSearchResult[]>(listItemsCacheKey);
      if (localCachedItems) {
        setListItems(localCachedItems);
        // Also update memory cache
        setCachedListItems(prev => new Map(prev).set(listId, localCachedItems));
        if (localCachedItems.length > 0) {
          setSelectedPaper(localCachedItems[0]);
        }
        return;
      }
    }

    setListItemsLoading(true);
    setListItemsLoadingMessage('Loading list items…');
    try {
      // Simple fetch - no auth headers needed since we're authenticated
      const fetchStart = Date.now();
      console.log(`🕐 [TIMING] Frontend fetch started at: ${fetchStart}`);

      const response = await fetch(`/api/lists/${listId}/items`);

      const fetchComplete = Date.now();
      console.log(`🕐 [TIMING] Frontend fetch completed at: ${fetchComplete} (took ${fetchComplete - fetchStart}ms)`);

      if (response.ok) {
        const data = await response.json();
        const papers = data.list?.items?.map((item: any) => item.paper_data) || [];
        console.log(`🕐 [TIMING] Response size: ${JSON.stringify(data).length} characters, ${papers.length} papers`);

        setListItems(papers);

        // Cache in both memory and localStorage
        setCachedListItems(prev => new Map(prev).set(listId, papers));
        setCachedData(listItemsCacheKey, papers);

        // Auto-select first paper if available
        if (papers.length > 0) {
          setSelectedPaper(papers[0]);
        }

        const stateComplete = Date.now();
        console.log(`🕐 [TIMING] Frontend state updated at: ${stateComplete} (took ${stateComplete - fetchStart}ms total)`);
      }
    } catch (error) {
      console.error('Failed to fetch list items:', error);
    } finally {
      setListItemsLoading(false);
      setListItemsLoadingMessage('');
    }
  }, [user, cachedListItems]);

  // Set initial selected paper based on authentication status
  useEffect(() => {
    if (user && selectedPaper?.source === 'sample_data' && keywordResults.length === 0) {
      setSelectedPaper(null);
    }
  }, [user, selectedPaper, keywordResults.length]);

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
        .select('first_name, last_name, orcid_id, academic_website, profile_personalization, last_profile_enriched_at, profile_enrichment_version')
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
          first_name: data?.first_name ?? null,
          last_name: data?.last_name ?? null,
          orcid_id: data?.orcid_id ?? null,
          academic_website: data?.academic_website ?? null,
          profile_personalization: data?.profile_personalization ?? null,
          last_profile_enriched_at: data?.last_profile_enriched_at ?? null,
          profile_enrichment_version: data?.profile_enrichment_version ?? null,
        });

        // Show welcome modal if user hasn't provided their name yet
        if (data?.first_name === null) {
          setShowWelcomeModal(true);
        }
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


  useEffect(() => {
    if (!user) {
      // Preserve the sample paper while the tutorial is guiding first-time visitors
      const shouldPreserveSamplePaper =
        typeof window !== 'undefined' && localStorage.getItem('evidentia_tutorial_completed') !== 'true';

      // Reset profile states
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
      setProfileEditorVisible(false);

      // Reset feed and panel states to return to landing page
      if (!shouldPreserveSamplePaper) {
        setSelectedPaper(null);
      }
      setKeywordResults([]);
      setSelectedListId(null);
      setListItems([]);

      // Reset search states
      setKeywordQuery('');
      setYearQuery('');
      setLastKeywordQuery('');
      setLastYearQuery(null);
      setKeywordError('');
      setKeywordLoading(false);
      return;
    }

    refreshProfile();
    if (user) {
      fetchUserLists();
    } else {
      setUserLists([]);
    }
  }, [fetchUserLists, refreshProfile, user]);

  // Clear scraped content when selected paper changes
  useEffect(() => {
    setScrapedContent(null);
    setScrapedContentError('');
  }, [selectedPaper?.id]);

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

      const parsedManualKeywords = parseManualKeywords(profileManualKeywords);
      if (parsedManualKeywords.length === 0) {
        setProfileEnrichmentError('Add at least one keyword to generate your personalized feed.');
        return;
      }

      const hadManualKeywords = Boolean(profile?.profile_personalization?.manual_keywords?.length);

      setProfileEnrichmentLoading(true);
      setProfileEnrichmentError('');

      try {
        const response = await fetch('/api/profile/enrich', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            manualKeywords: parsedManualKeywords,
            source,
            force,
            skipOrcidFetch,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Profile enrichment failed');
        }

        const result = await response.json();

        trackEvent({
          name: 'profile_keywords_saved',
          properties: {
            keyword_count: parsedManualKeywords.length,
            first_save: !hadManualKeywords,
          },
        });

        // Track onboarding completion on first keyword save
        if (!hadManualKeywords) {
          trackEvent({
            name: 'onboarding_completed',
            properties: {
              keyword_count: parsedManualKeywords.length,
            },
          });
        }

        // Update local state with the enriched profile
        setProfile((prev) => {
          if (!prev) {
            return {
              first_name: null,
              last_name: null,
              orcid_id: effectiveOrcid,
              academic_website: null,
              profile_personalization: result.personalization,
              last_profile_enriched_at: result.last_profile_enriched_at,
              profile_enrichment_version: result.profile_enrichment_version,
            };
          }

          return {
            ...prev,
            profile_personalization: result.personalization,
            last_profile_enriched_at: result.last_profile_enriched_at,
            profile_enrichment_version: result.profile_enrichment_version,
          };
        });

      } catch (error) {
        console.error('Profile enrichment request failed', error);
        setProfileEnrichmentError(error instanceof Error ? error.message : 'We could not refresh your personalization. Please try again.');
        trackError('profile_enrichment', error instanceof Error ? error.message : 'Unknown error', 'runProfileEnrichment');
      } finally {
        setProfileEnrichmentLoading(false);
      }
    }, [
      authModal,
      profile?.orcid_id,
      profileEnrichmentLoading,
      profileManualKeywords,
      user,
      profile?.profile_personalization?.manual_keywords?.length,
      trackEvent,
      trackError,
    ]);

  const handleRefreshPersonalFeed = useCallback(async (loadMore = false) => {
    const hasKeywords = profile?.profile_personalization?.manual_keywords?.length > 0;

    if (!hasKeywords) {
      // If no keywords, open profile editor
      setProfileEditorVisible(true);
      return;
    }

    // Clear current state (but not when loading more)
    if (!loadMore) {
      setSelectedListId(null);
      setListItems([]);
      setYearQuery('');
      setKeywordQuery('');
      setResultOffset(0);
    }

    const currentOffset = loadMore ? resultOffset : 0;
    const limit = 10;

    // Fetch from personal feed API
    if (loadMore) {
      setLoadingMore(true);
    } else {
      setKeywordLoading(true);
      setKeywordError('');
      setLastKeywordQuery(PERSONAL_FEED_LABEL);
      setLastYearQuery(null);
    }

    try {
      const response = await fetch(`/api/personal-feed?offset=${currentOffset}&limit=${limit}`);

      if (!response.ok) {
        throw new Error(`Personal feed failed with status ${response.status}`);
      }

      const data = await response.json();
      const results = Array.isArray(data.results) ? data.results : [];
      const hasMore = data.hasMore ?? false;

      if (loadMore) {
        setKeywordResults(prev => [...prev, ...results]);
        setResultOffset(currentOffset + results.length);
      } else {
        setKeywordResults(results);
        setResultOffset(results.length);
        if (results.length > 0) {
          setSelectedPaper(results[0]);
        } else {
          setKeywordError('No recent papers found in your personal feed. Papers are updated daily.');
        }
      }

      setHasMoreResults(hasMore);

      trackEvent({
        name: 'personal_feed_loaded',
        properties: {
          results_count: results.length,
          load_more: loadMore,
        },
      });
    } catch (error) {
      console.error('Personal feed error:', error);
      if (!loadMore) {
        setKeywordError('Could not load your personal feed. Please try again.');
      }
      trackError('personal_feed', error instanceof Error ? error.message : 'Unknown error', 'handleRefreshPersonalFeed');
    } finally {
      if (loadMore) {
        setLoadingMore(false);
      } else {
        setKeywordLoading(false);
      }
    }
  }, [profile, resultOffset, trackEvent, trackError]);

  const handleKeywordSearch = useCallback(async (e: React.FormEvent, loadMore = false) => {
    e.preventDefault();
    const trimmed = keywordQuery.trim();
    const trimmedYear = yearQuery.trim();
    const parsedYear = trimmedYear ? parseInt(trimmedYear, 10) : null;
    const validYear = parsedYear && parsedYear >= 1900 && parsedYear <= new Date().getFullYear() + 2 ? parsedYear : null;
    const atLeastOneFilter = researchChecked || patentsChecked;

    if (!user && !loadMore) {
      authModal.openSignup();
      return;
    }

    // Clear list selection when searching (but not when loading more)
    if (!loadMore) {
      setSelectedListId(null);
      setListItems([]);
    }

    if (!trimmed) {
      if (user) {
        setKeywordError('Enter keywords to explore the literature feed.');
      } else {
        setKeywordError('');
      }
      setKeywordResults([]);
      setSelectedPaper(!user ? SAMPLE_PAPERS[0] : null);
      setLastKeywordQuery('');
      setLastYearQuery(null);
      setResultOffset(0);
      setHasMoreResults(false);
      return;
    }

    if (!atLeastOneFilter) {
      setKeywordError('Select at least one source before searching.');
      setKeywordResults([]);
      setSelectedPaper(!user ? SAMPLE_PAPERS[0] : null);
      setLastKeywordQuery('');
      setLastYearQuery(null);
      setResultOffset(0);
      setHasMoreResults(false);
      return;
    }

    const filterLabels: string[] = [];
    if (researchChecked) filterLabels.push('research');
    if (patentsChecked) filterLabels.push('patents');

    const queryWithFilters = filterLabels.length
      ? `${trimmed} ${filterLabels.join(' ')}`
      : trimmed;

    const currentOffset = loadMore ? resultOffset : 0;
    const limit = 10;

    if (loadMore) {
      setLoadingMore(true);
    } else {
      setKeywordLoading(true);
      setKeywordError('');
      setLastKeywordQuery(trimmed);
      setLastYearQuery(validYear);
      setResultOffset(0);
    }

    const startTime = typeof performance !== 'undefined' ? performance.now() : null;

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: queryWithFilters,
          ...(validYear && { year: validYear }),
          offset: currentOffset,
          limit
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload.error === 'string' ? payload.error : 'Unable to fetch results right now.';
        setKeywordError(message);
        if (!loadMore) {
          setKeywordResults([]);
          setSelectedPaper(!user ? SAMPLE_PAPERS[0] : null);
        }
        return;
      }

      const payload = await response.json();
      const results = Array.isArray(payload.results) ? payload.results : [];
      const hasMore = payload.hasMore ?? false;

      if (loadMore) {
        setKeywordResults(prev => [...prev, ...results]);
        setResultOffset(currentOffset + results.length);
      } else {
        setKeywordResults(results);
        setResultOffset(results.length);
        setSelectedPaper(prev => {
          if (prev && results.find(result => result.id === prev.id)) {
            return prev;
          }
          return results[0] ?? null;
        });
      }

      setHasMoreResults(hasMore);

      const sources: ('research' | 'patents')[] = [];
      if (researchChecked) sources.push('research');
      if (patentsChecked) sources.push('patents');

      trackEvent({
        name: 'search_performed',
        properties: {
          query: trimmed,
          results_count: results.length,
          duration_ms: startTime ? Math.round(performance.now() - startTime) : undefined,
          sources,
          year_filter: validYear ?? null,
        },
      });
    } catch (error) {
      console.error('Keyword search failed', error);
      setKeywordError('We could not reach the search service. Please try again.');
      if (!loadMore) {
        setKeywordResults([]);
        setSelectedPaper(!user ? SAMPLE_PAPERS[0] : null);
      }
      trackError('search', error instanceof Error ? error.message : 'Unknown error', 'handleKeywordSearch');
    } finally {
      if (loadMore) {
        setLoadingMore(false);
      } else {
        setKeywordLoading(false);
      }
    }
  }, [keywordQuery, yearQuery, researchChecked, patentsChecked, user, resultOffset, trackEvent, trackError, authModal]);

  const handleLoadMore = useCallback(async () => {
    const isPersonalFeedActive = lastKeywordQuery === PERSONAL_FEED_LABEL;

    if (isPersonalFeedActive) {
      await handleRefreshPersonalFeed(true);
    } else {
      const syntheticEvent = {
        preventDefault: () => {},
      } as React.FormEvent;
      await handleKeywordSearch(syntheticEvent, true);
    }
  }, [lastKeywordQuery, handleRefreshPersonalFeed, handleKeywordSearch]);

  // Stop polling personal feed
  const stopFeedPolling = useCallback(() => {
    if (feedPollingIntervalRef.current) {
      clearInterval(feedPollingIntervalRef.current);
      feedPollingIntervalRef.current = null;
    }
    setFeedPopulating(false);
    setKeywordLoading(false);
    feedObservedChangeRef.current = false;
    feedLastUpdatedRef.current = null;
    feedBaselineRecordedRef.current = false;
  }, []);

  // Start polling personal feed for progressive updates
  const startFeedPolling = useCallback(() => {
    // Clear any existing polling
    if (feedPollingIntervalRef.current) {
      clearInterval(feedPollingIntervalRef.current);
    }

    // Reset polling state
    feedPollCountRef.current = 0;
    feedLastResultCountRef.current = 0;
    feedStableCountRef.current = 0;
    hasSetFirstPaperRef.current = false;
    feedObservedChangeRef.current = false;
    feedLastUpdatedRef.current = null;
    feedBaselineRecordedRef.current = false;
    setFeedPopulating(true);
    setKeywordLoading(true);

    const maxPolls = 40; // 40 * 3s = 2 minutes max
    const stableThreshold = 2; // Stop if results unchanged for 2 polls

    const pollFeed = async () => {
      feedPollCountRef.current++;

      try {
        const response = await fetch('/api/personal-feed');
        if (response.ok) {
          const data = await response.json();
          const results = Array.isArray(data.results) ? data.results : [];

          // Update results as they come in
          setKeywordResults(results);

          // Set first paper only once using ref
          if (results.length > 0 && !hasSetFirstPaperRef.current) {
            setSelectedPaper(results[0]);
            hasSetFirstPaperRef.current = true;
          }

          // Detect if results have stabilized
          const lastUpdated = typeof data.lastUpdated === 'string' ? data.lastUpdated : null;

          if (!feedBaselineRecordedRef.current) {
            feedBaselineRecordedRef.current = true;
            feedLastResultCountRef.current = results.length;
            feedLastUpdatedRef.current = lastUpdated ?? null;
            feedStableCountRef.current = 0;
          } else {
            const previousCount = feedLastResultCountRef.current;
            const previousUpdated = feedLastUpdatedRef.current;

            if (lastUpdated && lastUpdated !== previousUpdated) {
              feedObservedChangeRef.current = true;
              feedStableCountRef.current = 0;
            }

            if (results.length !== previousCount) {
              if (results.length > previousCount) {
                feedObservedChangeRef.current = true;
              }
              feedStableCountRef.current = 0;
            } else if (results.length > 0) {
              feedStableCountRef.current++;
            }

            feedLastResultCountRef.current = results.length;
            feedLastUpdatedRef.current = lastUpdated ?? feedLastUpdatedRef.current;

            const hasStableResults = feedObservedChangeRef.current && results.length > 0 && feedStableCountRef.current >= stableThreshold;

            // Stop polling if results are stable or max attempts reached
            if (hasStableResults || feedPollCountRef.current >= maxPolls) {
              console.log(`[polling] Stopping - stable: ${feedStableCountRef.current >= stableThreshold}, max: ${feedPollCountRef.current >= maxPolls}`);
              stopFeedPolling();
            }
          }
        }
      } catch (error) {
        console.error('[polling] Feed polling error:', error);
        // Stop polling on persistent errors
        if (feedPollCountRef.current >= 3) {
          stopFeedPolling();
        }
      }
    };

    // Poll immediately, then every 3 seconds
    pollFeed();
    feedPollingIntervalRef.current = setInterval(pollFeed, 3000);
  }, [stopFeedPolling]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (feedPollingIntervalRef.current) {
        clearInterval(feedPollingIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (profile) {
      const formattedOrcid = formatOrcidId(profile.orcid_id ?? '');
      setProfileFormOrcid(formattedOrcid);
      setProfileFormWebsite(profile.academic_website ?? '');
      setOrcidEditingMode(false);
      setWebsiteEditingMode(false);

      // Set the last auto-saved ORCID to the current profile ORCID to prevent auto-saving on modal open
      if (formattedOrcid.trim()) {
        lastAutoSavedOrcidRef.current = normalizeOrcidId(formattedOrcid.trim());
      }

      const currentVersion = profile.profile_enrichment_version ?? 'initial';
      if (manualKeywordsSeededVersion !== currentVersion) {
        if (!profileManualKeywordsRef.current.trim() && profile.profile_personalization?.topic_clusters?.length) {
          const seedKeywords = profile.profile_personalization.topic_clusters
            .map((cluster) => cluster.keywords?.[0] || cluster.label)
            .filter((value): value is string => Boolean(value))
            .slice(0, 5);
          if (seedKeywords.length) {
            setProfileManualKeywords(seedKeywords.join('\n'));
          }
        }
        setManualKeywordsSeededVersion(currentVersion);
      }
    } else {
      setProfileFormOrcid('');
      setProfileFormWebsite('');
      setProfileManualKeywords('');
      setManualKeywordsSeededVersion(null);
      lastAutoSavedOrcidRef.current = '';
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

  const hasKeywords = profile?.profile_personalization?.manual_keywords && profile.profile_personalization.manual_keywords.length > 0;
  const profileNeedsSetup = Boolean(user) && !profileLoading && !profileError && (!profile || !hasKeywords);
  const isPersonalFeedActive = lastKeywordQuery === PERSONAL_FEED_LABEL;
  const hasActiveSearchResults = keywordResults.length > 0 && !isPersonalFeedActive;
  const hasActiveSearchQuery = Boolean(lastKeywordQuery) && !isPersonalFeedActive;
  const hasSearchError = Boolean(keywordError) && !isPersonalFeedActive;
  const isSearchContext = (keywordLoading && !isPersonalFeedActive) || hasActiveSearchResults || hasActiveSearchQuery || hasSearchError;
  const isListViewActive = Boolean(selectedListId);
  const shouldShowPersonalFeed = Boolean(user && hasKeywords && !profileNeedsSetup && !isListViewActive && (!isSearchContext || isPersonalFeedActive));

  useEffect(() => {
    if (!user) {
      personalFeedInitializedRef.current = false;
      return;
    }

    if (
      personalFeedInitializedRef.current ||
      profileLoading ||
      profileError ||
      profileNeedsSetup ||
      !hasKeywords ||
      keywordLoading ||
      feedPopulating ||
      keywordResults.length > 0 ||
      lastKeywordQuery === PERSONAL_FEED_LABEL
    ) {
      return;
    }

    personalFeedInitializedRef.current = true;
    handleRefreshPersonalFeed();
  }, [
    user,
    hasKeywords,
    profileNeedsSetup,
    profileLoading,
    profileError,
    keywordLoading,
    feedPopulating,
    keywordResults.length,
    lastKeywordQuery,
    handleRefreshPersonalFeed,
  ]);

  const personalizationInputs = (includeAction: boolean) => {
    const keywordsId = includeAction ? 'profile-keywords-editor' : 'profile-keywords';
    const resumeId = includeAction ? 'profile-resume-editor' : 'profile-resume';

    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <label htmlFor={keywordsId} className={PROFILE_LABEL_CLASSES}>
            Search queries <span className="text-xs font-normal text-slate-500">(one per line, 3+ words each)</span>
          </label>
          <textarea
            id={keywordsId}
            rows={6}
            value={profileManualKeywords}
            onChange={(event) => setProfileManualKeywords(event.target.value)}
            placeholder="Carbon capture food production"
            className={PROFILE_INPUT_CLASSES}
          />
        </div>
      </div>
    );
  };
  const handleSelectPaper = useCallback(
    (paper: ApiSearchResult, via: 'search_result' | 'list' | 'personal_feed') => {
      if (selectedPaper?.id !== paper.id) {
        trackEvent({
          name: 'paper_viewed',
          properties: {
            paper_id: paper.id,
            paper_title: paper.title,
            source: paper.source,
            via,
          },
        });
      }

      setSelectedPaper(paper);
    },
    [selectedPaper?.id, trackEvent]
  );

  const renderResultList = (results: ApiSearchResult[], contextLabel: string, selectionSource: 'search_result' | 'list' | 'personal_feed') => {
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

          return (
            <article
              key={result.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectPaper(result, selectionSource)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleSelectPaper(result, selectionSource);
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
      <form id={formId} onSubmit={handleProfileSave} className="space-y-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="profile-orcid" className={PROFILE_LABEL_CLASSES}>
              ORCID ID <span className="text-xs font-normal text-slate-500">(keywords auto-generated)</span>
            </label>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="profile-orcid"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Enter ORCID ID (e.g., 0000-0002-1825-0097)"
              value={profileFormOrcid}
              onChange={(event) => setProfileFormOrcid(formatOrcidId(event.target.value))}
              onInput={(event) => {
                // Ensure autofill is captured (some browsers only trigger input, not change)
                const target = event.target as HTMLInputElement;
                setProfileFormOrcid(formatOrcidId(target.value));
              }}
              className={`flex-1 ${PROFILE_INPUT_CLASSES}`}
            />
            <button
              type="button"
              onClick={handleOrcidSave}
              disabled={profileEnrichmentLoading}
              className="w-full rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {profileEnrichmentLoading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={PROFILE_LABEL_CLASSES}>Academic website</span>
            <span className={PROFILE_COMING_SOON_HINT_CLASSES}>Coming soon</span>
          </div>
          <input
            id="profile-website"
            type="text"
            placeholder="Enter your academic website URL"
            value={profileFormWebsite}
            onChange={(event) => setProfileFormWebsite(event.target.value)}
            disabled
            className={`${PROFILE_INPUT_CLASSES} opacity-50 cursor-not-allowed`}
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
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
          <div className="flex w-full sm:justify-end">
            <button type="submit" className={PROFILE_PRIMARY_BUTTON_CLASSES} disabled={profileSaving}>
              {profileSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </form>
    );
  };
  let mainFeedContent: ReactNode = null;

  if (keywordLoading && keywordResults.length === 0) {
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
        {renderResultList(listItems, 'Saved paper', 'list')}
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
        {feedPopulating && (
          <span className={FEED_LOADING_PILL_CLASSES}>
            <span className={FEED_SPINNER_CLASSES} aria-hidden="true" />
            <span>Populating your feed…</span>
          </span>
        )}
        <div className={RESULT_SUMMARY_CLASSES}>
          <span>Showing</span>
          <span className="text-base font-semibold text-slate-900">{keywordResults.length}</span>
          <span>result{keywordResults.length === 1 ? '' : 's'} for</span>
          <span className="text-base font-semibold text-slate-900">&ldquo;{lastKeywordQuery}&rdquo;</span>
          {lastYearQuery && (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
              {lastYearQuery}
            </span>
          )}
        </div>
        {renderResultList(keywordResults, 'Search result', 'search_result')}
        {hasMoreResults && !keywordLoading && !loadingMore && !feedPopulating && (
          <div className="flex justify-center mt-4">
            <button
              type="button"
              onClick={handleLoadMore}
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2"
            >
              Load More
            </button>
          </div>
        )}
        {loadingMore && (
          <div className="flex justify-center mt-4">
            <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm text-slate-600">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" aria-hidden="true" />
              <span>Loading more...</span>
            </span>
          </div>
        )}
      </>
    );
  } else if (feedPopulating) {
    // Show loading state when populating feed with no results yet
    mainFeedContent = (
      <div className={FEED_LOADING_WRAPPER_CLASSES}>
        <span className={FEED_LOADING_PILL_CLASSES}>
          <span className={FEED_SPINNER_CLASSES} aria-hidden="true" />
          <span>Populating your feed…</span>
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
  } else if (lastKeywordQuery && !keywordError) {
    mainFeedContent = (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-100 px-6 py-10 text-center text-sm text-slate-600">
        Nothing surfaced for this query yet. Try refining keywords or toggling a different source.
      </div>
    );
  } else if (!user) {
    mainFeedContent = renderResultList(SAMPLE_PAPERS, 'Featured pick', 'search_result');
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

  const hasSelectedPaper = Boolean(selectedPaper);
  const selectedPaperId = selectedPaper?.id ?? null;
  const isSamplePaper = isSamplePaperId(selectedPaperId);
  const isVerificationSending = verificationRequestStatus === 'sending';
  const verificationRequests = verificationSummary?.requests ?? [];
  const hasActiveVerificationRequest = verificationRequests.some(request =>
    ['pending', 'in_progress'].includes(request.status)
  );
  const latestVerificationRequest = verificationRequests.length > 0 ? verificationRequests[0] : null;
  const communityReviewRequests = verificationSummary?.communityReviewRequests ?? [];
  const activeCommunityReviewRequest = user
    ? communityReviewRequests.find(request => request.user_id === user.id)
    : null;
  const hasCommunityReviewRequest = Boolean(activeCommunityReviewRequest);
  const reproducibilityReport = useMemo<ResearchPaperAnalysis | null>(() => (
    adaptReproducibilityReport(verificationSummary?.reproducibilityReport ?? null, selectedPaper)
  ), [verificationSummary?.reproducibilityReport, selectedPaper]);
  const hasReproReport = Boolean(reproducibilityReport);
  const shouldDisableVerification = !hasSelectedPaper || isVerificationSending || verificationSummaryLoading;

  const isTrackReportAvailable = (track: VerificationTrack) => {
    if (track === 'reproducibility') return hasReproReport;
    if (track === 'similar') {
      return Boolean(
        verificationSummary?.methodFindingCrosswalk?.papers &&
        Array.isArray(verificationSummary.methodFindingCrosswalk.papers) &&
        verificationSummary.methodFindingCrosswalk.papers.length > 0
      );
    }
    return false;
  };

  const compiledSimilarPapers = useMemo<CrosswalkDisplayPaper[]>(() => {
    if (!verificationSummary?.methodFindingCrosswalk) {
      return [];
    }

    const papers = verificationSummary.methodFindingCrosswalk.papers;

    if (!Array.isArray(papers)) {
      return [];
    }

    return papers.map((paper) => {
      const matrix: Record<LifeSciencesMatrixRowKey, string> = {
        sampleModel: paper.matrix?.sampleModel ?? 'Not reported',
        materialsRatios: paper.matrix?.materialsRatios ?? 'Not reported',
        equipmentSetup: paper.matrix?.equipmentSetup ?? 'Not reported',
        procedureSteps: paper.matrix?.procedureSteps ?? 'Not reported',
        controls: paper.matrix?.controls ?? 'Not reported',
        outputsMetrics: paper.matrix?.outputsMetrics ?? 'Not reported',
        qualityChecks: paper.matrix?.qualityChecks ?? 'Not reported',
        outcomeSummary: paper.matrix?.outcomeSummary ?? 'Not reported'
      }

      return {
        id: paper.id,
        title: paper.title,
        authors: paper.authors,
        venue: paper.venue,
        year: paper.year,
        citationCount: typeof paper.citationCount === 'number' ? paper.citationCount : null,
        clusterLabel: paper.clusterLabel,
        summary: paper.summary,
        highlight: paper.highlight,
        matrix,
        semanticScholarId: typeof paper.semanticScholarId === 'string' ? paper.semanticScholarId : null,
        doi: typeof paper.doi === 'string' ? paper.doi : null,
        url: typeof paper.url === 'string' ? paper.url : null
      }
    })
  }, [verificationSummary?.methodFindingCrosswalk]);

  const lifeSciencesMatrixRows = useMemo(
    () => buildLifeSciencesMatrixRows(compiledSimilarPapers),
    [compiledSimilarPapers]
  );

  useEffect(() => {
    if (lifeSciencesMatrixRows.length === 0) {
      setOpenCrosswalkRowKey(null);
      return;
    }

    setOpenCrosswalkRowKey(prevKey => {
      if (prevKey && lifeSciencesMatrixRows.some(row => row.key === prevKey)) {
        return prevKey;
      }

      return lifeSciencesMatrixRows[0].key;
    });
  }, [lifeSciencesMatrixRows]);

  const handleCrosswalkRowToggle = useCallback((rowKey: LifeSciencesMatrixRowKey) => {
    setOpenCrosswalkRowKey(prevKey => (prevKey === rowKey ? null : rowKey));
  }, []);

  const refreshVerificationSummary = useCallback(async () => {
    if (!selectedPaperId) {
      setVerificationSummary(null);
      return;
    }

    if (isSamplePaperId(selectedPaperId)) {
      const sampleReport = VERIFICATION_DATA[selectedPaperId] ?? null;
      setVerificationSummary({
        requests: [],
        communityReviewRequests: [],
        reproducibilityReport: sampleReport,
        methodFindingCrosswalk: SAMPLE_METHOD_FINDING_CROSSWALK[selectedPaperId] ?? null
      });
      return;
    }

    setVerificationSummaryLoading(true);
    try {
      const response = await fetch(`/api/papers/${selectedPaperId}/verification-summary`);
      if (!response.ok) {
        throw new Error('Failed to load verification summary');
      }
      const data = await response.json();
      setVerificationSummary({
        requests: Array.isArray(data.requests) ? data.requests : [],
        communityReviewRequests: Array.isArray(data.communityReviewRequests)
          ? data.communityReviewRequests
          : [],
        reproducibilityReport: data.reproducibilityReport ?? null,
        methodFindingCrosswalk: data.methodFindingCrosswalk ?? null
      });
    } catch (error) {
      console.error('Failed to load verification summary:', error);
      setVerificationSummary(null);
    } finally {
      setVerificationSummaryLoading(false);
    }
  }, [selectedPaperId]);

  const handleCommunityReviewRequest = useCallback(async (source: VerificationTrack) => {
    if (!selectedPaper) {
      return;
    }

    if (!user) {
      authModal.openSignup();
      return;
    }

    if (isSamplePaper) {
      setCommunityReviewError('Select a paper from your feed to request a community review.');
      setCommunityReviewStatus('error');
      return;
    }

    if (communityReviewStatus === 'sending') {
      return;
    }

    if (hasCommunityReviewRequest) {
      setCommunityReviewStatus('success');
      setCommunityReviewError('');
      return;
    }

    setCommunityReviewStatus('sending');
    setCommunityReviewError('');

    try {
      const response = await fetch(`/api/papers/${selectedPaper.id}/community-review-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          paper: buildVerificationPayloadFromSearchResult(selectedPaper),
          source
        })
      });

      if (!response.ok) {
        let message = 'Failed to submit community review request. Please try again.';
        try {
          const errorData = await response.json();
          if (errorData?.error) {
            message = errorData.error;
          }
        } catch (parseError) {
          console.error('Failed to parse community review error response:', parseError);
        }
        setCommunityReviewError(message);
        setCommunityReviewStatus('error');
        return;
      }

      try {
        const data = await response.json();
        if (!data?.alreadyExists) {
          await refreshVerificationSummary();
        } else {
          refreshVerificationSummary();
        }
      } catch (parseError) {
        console.error('Failed to parse community review success response:', parseError);
        refreshVerificationSummary();
      }

      setCommunityReviewStatus('success');
      setCommunityReviewError('');
    } catch (requestError) {
      console.error('Community review request failed:', requestError);
      setCommunityReviewError(
        requestError instanceof Error
          ? requestError.message
          : 'Unexpected error submitting community review request.'
      );
      setCommunityReviewStatus('error');
    }
  }, [selectedPaper, user, authModal, isSamplePaper, communityReviewStatus, hasCommunityReviewRequest, refreshVerificationSummary]);

  const handlePaperSaved = useCallback((listId?: number) => {
    const startTime = Date.now();
    console.log('📝 [PERF] handlePaperSaved started');

    if (user) {
      const listCacheKey = `${LIST_METADATA_CACHE_KEY}-${user.id}`;
      clearCachedData(listCacheKey);

      if (listId) {
        const listItemsCacheKey = `${LIST_ITEMS_CACHE_KEY}-${user.id}-${listId}`;
        clearCachedData(listItemsCacheKey);

        setCachedListItems(prev => {
          const newCache = new Map(prev);
          newCache.delete(listId);
          return newCache;
        });
      }

      console.log('📝 [PERF] Refreshing user lists after save');
      fetchUserLists(true);

      if (listId && selectedListId === listId) {
        fetchListItems(listId, true);
      }
    }

    console.log(`📝 [PERF] handlePaperSaved completed in ${Date.now() - startTime}ms`);
  }, [user, fetchUserLists, selectedListId, fetchListItems]);

  const handleCommunityReviewButtonClick = useCallback(() => {
    handleCommunityReviewRequest('reproducibility');
  }, [handleCommunityReviewRequest]);

  const handleSimilarPaperSaveClick = useCallback(async (crosswalkPaper: CrosswalkDisplayPaper) => {
    if (!user) {
      authModal.openSignup();
      return;
    }

    if (!selectedPaper) {
      setSimilarPaperSaveState((prev) => ({
        ...prev,
        [crosswalkPaper.id]: {
          status: 'error',
          message: 'Select a paper to save related literature.'
        }
      }));
      return;
    }

    if (isSamplePaper) {
      setSimilarPaperSaveState((prev) => ({
        ...prev,
        [crosswalkPaper.id]: {
          status: 'error',
          message: 'Open a live paper to save related literature.'
        }
      }));
      return;
    }

    setSimilarPaperSaveState((prev) => ({
      ...prev,
      [crosswalkPaper.id]: {
        status: 'saving'
      }
    }));

    try {
      const listName = buildCompileListName(crosswalkPaper.title || selectedPaper.title || '');
      const verifyListName = buildVerifyListName(selectedPaper.title || '');
      const existingLists = userLists.map((list) => ({ id: list.id, name: list.name }));
      const existingVerifyList = existingLists.find((list) => list.name === verifyListName) ?? null;

      const updateListCaches = (targetListId: number, item: ApiSearchResult, position: 'start' | 'end') => {
        let itemsChanged = false;
        let updatedItems: ApiSearchResult[] | null = null;

        setCachedListItems((prev) => {
          const existing = prev.get(targetListId) ?? [];
          if (existing.some(existingItem => existingItem.id === item.id)) {
            updatedItems = existing;
            return prev;
          }

          updatedItems = position === 'start' ? [item, ...existing] : [...existing, item];
          itemsChanged = true;
          const next = new Map(prev);
          next.set(targetListId, updatedItems);
          return next;
        });

        if (itemsChanged && updatedItems) {
          if (user) {
            const listItemsCacheKey = `${LIST_ITEMS_CACHE_KEY}-${user.id}-${targetListId}`;
            setCachedData(listItemsCacheKey, updatedItems);
          }
          if (selectedListId === targetListId) {
            setListItems(updatedItems);
          }
        }
      };

      const baseListPayload = mapSearchResultToListPayload(selectedPaper);
      const baseSaveResult = await savePaperToNamedList({
        listName,
        paper: baseListPayload,
        existingLists
      });

      if (!baseSaveResult.listId) {
        throw new Error('Unable to determine list for this paper.');
      }

      const targetListId = baseSaveResult.listId;

      if (baseSaveResult.status === 'saved') {
        handlePaperSaved(targetListId);
        updateListCaches(targetListId, convertListPayloadToDisplayItem(baseListPayload), 'start');
      } else if (baseSaveResult.status !== 'already-in-list') {
        const baseFailureMessage = baseSaveResult.error ?? 'Unable to save this paper right now.';
        throw new Error(baseFailureMessage);
      }

      const listsForSimilar = existingLists.some((list) => list.id === targetListId)
        ? existingLists
        : [...existingLists, { id: targetListId, name: listName }];

      const resolution = await resolveCrosswalkPaperForSave(crosswalkPaper, selectedPaper.id);

      const saveResult = await savePaperToNamedList({
        listName,
        paper: resolution.listPayload,
        existingLists: listsForSimilar
      });

      const resolvedListId = saveResult.listId ?? targetListId;

      if (resolvedListId) {
        handlePaperSaved(resolvedListId);
      }

      const addedToCompileList = saveResult.status === 'saved';
      const alreadyInCompileList = saveResult.status === 'already-in-list';

      if (addedToCompileList) {
        updateListCaches(resolvedListId, resolution.displayItem, 'end');

        trackEvent({
          name: 'similar_paper_saved',
          properties: {
            paper_id: resolution.listPayload.id,
            list_name: listName,
            source: resolution.listPayload.source ?? 'method_crosswalk',
            match_strategy: resolution.matchStrategy
          }
        });
      } else if (!alreadyInCompileList) {
        const failureMessage = saveResult.error ?? 'Unable to save this paper right now.';
        throw new Error(failureMessage);
      }

      // Ensure the related paper also lands in the parent paper's VERIFY list/feed.
      const verifyListsForSave = listsForSimilar.some((list) => list.name === verifyListName)
        ? listsForSimilar
        : existingVerifyList
          ? [...listsForSimilar, existingVerifyList]
          : listsForSimilar;

      const verifySaveResult = await savePaperToNamedList({
        listName: verifyListName,
        paper: resolution.listPayload,
        existingLists: verifyListsForSave
      });

      const verifyListId = verifySaveResult.listId ?? existingVerifyList?.id ?? null;

      if (verifyListId) {
        handlePaperSaved(verifyListId);
      }

      const addedToVerifyList = verifySaveResult.status === 'saved';
      const alreadyInVerifyList = verifySaveResult.status === 'already-in-list';

      if (addedToVerifyList && verifyListId) {
        updateListCaches(verifyListId, resolution.displayItem, 'end');
      } else if (!alreadyInVerifyList) {
        const verifyFailureMessage = verifySaveResult.error ?? 'Unable to save this paper to the verification list right now.';
        throw new Error(verifyFailureMessage);
      }

      const message = (() => {
        if (!alreadyInCompileList && !alreadyInVerifyList) {
          return `Added to ${listName} and the verification list.`;
        }
        if (!alreadyInCompileList && alreadyInVerifyList) {
          return `Added to ${listName}; already in the verification list.`;
        }
        if (alreadyInCompileList && !alreadyInVerifyList) {
          return `Already in ${listName}; added to the verification list.`;
        }
        return `This paper is already saved in ${listName} and the verification list.`;
      })();

      setSimilarPaperSaveState((prev) => ({
        ...prev,
        [crosswalkPaper.id]: {
          status: alreadyInCompileList && alreadyInVerifyList ? 'already' : 'success',
          message
        }
      }));

      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error saving paper.';
      console.error('Similar paper save failed:', error);
      setSimilarPaperSaveState((prev) => ({
        ...prev,
        [crosswalkPaper.id]: {
          status: 'error',
          message
        }
      }));
      trackError('similar_paper_save', message, 'handleSimilarPaperSaveClick');
    }
  }, [authModal, user, selectedPaper, isSamplePaper, userLists, handlePaperSaved, selectedListId, trackEvent, trackError, setCachedListItems]);

  const updateVerificationView = (track: VerificationTrack) => {
    if (selectedPaper) {
      setPaperViewMemory(prev => new Map(prev).set(selectedPaper.id, track));
    }
    setVerificationView(track);
  };

  const handleVerificationRequest = async (track: VerificationTrack) => {
    if (!selectedPaper) {
      return;
    }

    if (track === 'paper') {
      updateVerificationView('paper');
      return;
    }

    updateVerificationView(track);

    if (isTrackReportAvailable(track)) {
      setVerificationModalOpen(false);
      setActiveVerificationRequestType(null);
      setVerificationRequestStatus('idle');
      setVerificationRequestError('');
      return;
    }

    if (shouldDisableVerification) {
      return;
    }

    if (hasActiveVerificationRequest) {
      setActiveVerificationRequestType('combined');
      setVerificationRequestError('');
      setVerificationRequestStatus('success');
      requestAnimationFrame(() => {
        document.getElementById('verification-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }

    if (isSamplePaper) {
      const sampleReport = VERIFICATION_DATA[selectedPaper.id] ?? null;
      const now = new Date().toISOString();
      setActiveVerificationRequestType('combined');
      setVerificationRequestError('');
      setVerificationRequestStatus('success');
      setVerificationModalOpen(false);
      setVerificationSummary({
        requests: [
          {
            id: `sample-request-${selectedPaper.id}`,
            paper_id: selectedPaper.id,
            paper_lookup_id: selectedPaper.id,
            user_id: user?.id ?? null,
            verification_type: 'combined',
            status: 'completed',
            created_at: now,
            updated_at: now,
            completed_at: now,
            result_summary: sampleReport,
            request_payload: null,
            similar_papers_data: SAMPLE_METHOD_FINDING_CROSSWALK[selectedPaper.id] ?? null
          }
        ],
        communityReviewRequests: [],
        reproducibilityReport: sampleReport,
        methodFindingCrosswalk: SAMPLE_METHOD_FINDING_CROSSWALK[selectedPaper.id] ?? null
      });
      requestAnimationFrame(() => {
        document.getElementById('verification-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }

    if (!user) {
      authModal.openLogin();
      return;
    }

    setActiveVerificationRequestType('combined');
    setVerificationRequestError('');
    setVerificationRequestStatus('sending');
    setVerificationModalOpen(true);

    try {
      const response = await fetch(`/api/papers/${selectedPaper.id}/verification-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          verificationType: 'combined',
          paper: buildVerificationPayloadFromSearchResult(selectedPaper)
        })
      });

      if (!response.ok) {
        let message = 'Failed to submit verification request. Please try again.';
        try {
          const errorData = await response.json();
          if (errorData?.error) {
            message = errorData.error;
          }
        } catch (parseError) {
          console.error('Failed to parse verification error response:', parseError);
        }
        setVerificationRequestError(message);
        setVerificationRequestStatus('error');
        return;
      }

      void savePaperToNamedList({
        listName: buildVerifyListName(selectedPaper.title),
        paper: selectedPaper,
        existingLists: userLists.map((list) => ({ id: list.id, name: list.name }))
      }).then((result) => {
        if (result.listId) {
          handlePaperSaved(result.listId);
        }
        if (result.status === 'failed' && result.error) {
          console.error('Failed to add paper to VERIFY list:', result.error);
        }
      });

      setVerificationRequestStatus('success');
      await refreshVerificationSummary();
      trackEvent({
        name: 'verification_requested',
        properties: {
          paper_id: selectedPaper.id,
          verification_type: 'combined',
          source: selectedPaper.source,
        },
      });
      trackEvent({
        name: 'research_compile_requested',
        properties: {
          paper_id: selectedPaper.id,
          paper_title: selectedPaper.title,
          source: selectedPaper.source,
        },
      });
    } catch (requestError) {
      console.error('Verification request failed:', requestError);
      setVerificationRequestError(
        requestError instanceof Error
          ? requestError.message
          : 'Unexpected error submitting verification request.'
      );
      setVerificationRequestStatus('error');
      trackError(
        'verification_request',
        requestError instanceof Error ? requestError.message : 'Unknown error',
        'handleVerificationRequest'
      );
    } finally {
      requestAnimationFrame(() => {
        document.getElementById('verification-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  const handleVerificationModalClose = () => {
    setVerificationModalOpen(false);
    setActiveVerificationRequestType(null);
    if (verificationRequestStatus === 'error') {
      setVerificationRequestStatus('idle');
      setVerificationRequestError('');
    }
  };


  const handleSaveWelcomeNames = async (firstName: string, lastName: string) => {
    if (!user) {
      return { message: 'No user found' };
    }

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('profiles')
        .update({ first_name: firstName, last_name: lastName })
        .eq('id', user.id);

      if (error) {
        console.error('Failed to save welcome names:', error);
        return error;
      }

      // Update local profile state so modal doesn't reappear
      setProfile(prev => prev ? { ...prev, first_name: firstName, last_name: lastName } : null);
      setShowWelcomeModal(false);

      // Check if ORCID is empty, if so show ORCID search modal
      if (!profile?.orcid_id) {
        setShowOrcidSearchModal(true);
      }

      return null;
    } catch (err) {
      console.error('Unexpected error saving welcome names:', err);
      return { message: 'Unexpected error occurred' };
    }
  };

  const handleSelectOrcid = async (orcidId: string) => {
    if (!user) {
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('profiles')
        .update({ orcid_id: orcidId })
        .eq('id', user.id);

      if (error) {
        console.error('Failed to save ORCID:', error);
        return;
      }

      // Update local profile state
      setProfile(prev => prev ? { ...prev, orcid_id: orcidId } : null);

      // Update the profile form field so it shows in the profile editor
      setProfileFormOrcid(orcidId);

      // Close modal
      setShowOrcidSearchModal(false);
    } catch (err) {
      console.error('Unexpected error saving ORCID:', err);
    }
  };

  const handleSkipOrcid = () => {
    setShowOrcidSearchModal(false);
  };

  useEffect(() => {
    setVerificationRequestStatus('idle');
    setVerificationRequestError('');
    setActiveVerificationRequestType(null);
    setCommunityReviewStatus('idle');
    setCommunityReviewError('');

    if (!selectedPaperId) {
      setVerificationSummary(null);
      return;
    }

    refreshVerificationSummary();
  }, [selectedPaperId, refreshVerificationSummary]);

  useEffect(() => {
    if (communityReviewStatus === 'sending') {
      return;
    }

    if (!user) {
      if (communityReviewStatus !== 'idle') {
        setCommunityReviewStatus('idle');
        setCommunityReviewError('');
      }
      return;
    }

    if (hasCommunityReviewRequest) {
      if (communityReviewStatus !== 'success') {
        setCommunityReviewStatus('success');
        setCommunityReviewError('');
      }
    } else if (communityReviewStatus === 'success') {
      setCommunityReviewStatus('idle');
      setCommunityReviewError('');
    }
  }, [communityReviewStatus, hasCommunityReviewRequest, user]);

  const getVerificationButtonClasses = (track: VerificationTrack) => {
    if (track === 'reproducibility' && shouldDisableVerification) {
      return 'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 cursor-not-allowed opacity-60';
    }

    if (track === 'similar') {
      const classes = [DETAIL_SIMILAR_BUTTON_CLASSES];
      if (verificationView === 'similar') {
        classes.push(DETAIL_SIMILAR_BUTTON_ACTIVE_CLASSES);
      }
      return classes.join(' ');
    }

    const classes = [DETAIL_REPRO_BUTTON_CLASSES];
    if (verificationView === track) {
      classes.push(DETAIL_VERIFY_BUTTON_ACTIVE_CLASSES);
    }
    return classes.join(' ');
  };

  const BASE_LABELS: Record<VerificationTrack, string> = {
    reproducibility: 'CAN I REPRODUCE THIS?',
    paper: 'SHOW THIS PAPER',
    similar: 'SIMILAR PAPERS'
  };

  const VIEW_LABELS: Record<VerificationTrack, string> = {
    reproducibility: 'CAN I REPRODUCE THIS?',
    paper: 'SHOW THIS PAPER',
    similar: 'SIMILAR PAPERS'
  };

  const getVerificationButtonLabel = (track: VerificationTrack): string => {
    if (track === 'paper') {
      return 'PAPER';
    }
    if (track === 'similar') {
      return verificationView === 'similar' ? VIEW_LABELS.similar : BASE_LABELS.similar;
    }
    if (isVerificationSending) {
      return 'Sending request…';
    }
    if (isTrackReportAvailable(track)) {
      return VIEW_LABELS[track];
    }
    return BASE_LABELS[track];
  };

  const getVerificationButtonTitle = (track: VerificationTrack): string => {
    if (track === 'paper') {
      return 'View paper details (authors and abstract)';
    }
    if (track === 'similar') {
      return hasSelectedPaper
        ? 'Explore curated clusters of adjacent literature that echo this study.'
        : 'Select a paper to explore similar work.';
    }
    if (!hasSelectedPaper) {
      return 'Select a paper to request a verification briefing.';
    }
    if (isVerificationSending) {
      return 'Sending your request…';
    }
    if (isSamplePaper) {
      return 'Preview the example briefing for this sample paper.';
    }
    if (isTrackReportAvailable(track)) {
      return 'View the latest reproducibility briefing for this paper.';
    }
    if (hasActiveVerificationRequest) {
      return 'Our agent is already processing this paper — switch views to review progress.';
    }
    return 'Kick off the reproducibility briefing.';
  };

  const communityReviewIsSending = communityReviewStatus === 'sending';
  const communityReviewIsComplete = hasCommunityReviewRequest || communityReviewStatus === 'success';
  const communityReviewButtonDisabled = !hasSelectedPaper || communityReviewIsSending || communityReviewIsComplete;
  const communityReviewButtonLabel = communityReviewIsSending
    ? 'Sending…'
    : communityReviewIsComplete
      ? 'Request Received'
      : 'Community Review';
  const communityReviewErrorMessage = communityReviewStatus === 'error' ? communityReviewError : '';
  const communityReviewSuccessMessage = communityReviewIsComplete
    ? 'Thanks — we\'ll reach out via email to coordinate this review.'
    : '';

  const verificationButtons = (
    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => updateVerificationView('paper')}
          className={getVerificationButtonClasses('paper')}
          aria-pressed={verificationView === 'paper'}
          title={getVerificationButtonTitle('paper')}
          data-tutorial="show-paper-button"
        >
          <span className="flex items-center gap-2">
            PAPER
          </span>
        </button>
        <span
          className={`h-1 w-full rounded-full bg-gradient-to-r from-slate-400 via-slate-500 to-slate-600 transition-all duration-200 ease-out ${verificationView === 'paper' ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
        />
      </div>
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => handleVerificationRequest('reproducibility')}
          className={getVerificationButtonClasses('reproducibility')}
          aria-pressed={verificationView === 'reproducibility'}
          disabled={shouldDisableVerification}
          title={getVerificationButtonTitle('reproducibility')}
          data-tutorial="reproducibility-button"
        >
          <span className="flex items-center gap-2">
            {getVerificationButtonLabel('reproducibility')}
          </span>
        </button>
        <span
          className={`h-1 w-full rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-sky-600 transition-all duration-200 ease-out ${verificationView === 'reproducibility' ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
        />
      </div>
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => handleVerificationRequest('similar')}
          className={getVerificationButtonClasses('similar')}
          aria-pressed={verificationView === 'similar'}
          title={getVerificationButtonTitle('similar')}
          data-tutorial="similar-papers-button"
        >
          <span className="flex items-center gap-2">
            {getVerificationButtonLabel('similar')}
          </span>
        </button>
        <span
          className={`h-1 w-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-500 to-sky-500 transition-all duration-200 ease-out ${verificationView === 'similar' ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
        />
      </div>
      <div className="flex flex-col items-center gap-1">
        <button type="button" className={DETAIL_PATENT_BUTTON_CLASSES} disabled>
          <span className="flex items-center gap-2">SIMILAR PATENTS</span>
        </button>
        <span className="h-1 w-full rounded-full bg-slate-200 opacity-0" aria-hidden="true" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <button type="button" className={DETAIL_PATENT_BUTTON_CLASSES} disabled>
          <span className="flex items-center gap-2">COMMUNITY</span>
        </button>
        <span className="h-1 w-full rounded-full bg-slate-200 opacity-0" aria-hidden="true" />
      </div>
    </div>
  );

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

  const handleTutorialClose = () => {
    setTutorialOpen(false);
  };

  const handleTutorialSignUp = () => {
    authModal.openSignup();
  };

  const handleAuthModalClose = () => {
    authModal.close();

    // If this is the first time seeing auth and user is not logged in, show tour prompt
    if (hasSeenInitialAuth && !localStorage.getItem('evidentia_seen_initial_auth') && !user) {
      localStorage.setItem('evidentia_seen_initial_auth', 'true');
      setShowTourPrompt(true);
    }
  };

  const handleTourPromptYes = () => {
    setShowTourPrompt(false);
    // Auto-select CRISPR paper for demo
    setSelectedPaper(SAMPLE_PAPERS[0]);
    setVerificationView('paper');
    // Show tutorial after a brief delay
    setTimeout(() => {
      setTutorialOpen(true);
    }, 300);
  };

  const handleTourPromptNo = () => {
    setShowTourPrompt(false);
    localStorage.setItem('evidentia_tutorial_completed', 'true');
  };

  const handleTutorialStepChange = useCallback((step: number) => {
    const demoPaper = SAMPLE_PAPERS[0];

    if (!selectedPaper || selectedPaper.id !== demoPaper.id) {
      setSelectedPaper(demoPaper);
    }

    if (step === 0) {
      setVerificationView('paper');
      return;
    }

    if (step === 1 || step === 2) {
      setVerificationView('reproducibility');
      return;
    }

    if (step === 3) {
      setVerificationView('reproducibility');
      return;
    }

    if (step === 4) {
      setVerificationView('similar');
    }
  }, [selectedPaper, setSelectedPaper, setVerificationView]);

  const handleViewFullPaper = async () => {
    if (!selectedPaper || !selectedPaper.id.startsWith('sample-')) {
      return;
    }

    setScrapedContentLoading(true);
    setScrapedContentError('');

    try {
      const response = await fetch(`/api/papers/${selectedPaper.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch paper content');
      }

      const data = await response.json();

      // Check if we have structured processed content
      if (data.processedContent) {
        try {
          // Try to parse as JSON to validate it's structured content
          JSON.parse(data.processedContent);
          setScrapedContent(data.processedContent);
          setScrapedContentIsStructured(true);
        } catch (error) {
          // If JSON parsing fails, treat as raw content
          console.warn('processedContent is not valid JSON, treating as raw content');
          setScrapedContent(data.processedContent);
          setScrapedContentIsStructured(false);
        }
      } else if (data.scrapedContent) {
        // Fall back to raw scraped content
        setScrapedContent(data.scrapedContent);
        setScrapedContentIsStructured(false);
      } else {
        // No content available
        setScrapedContent(null);
        setScrapedContentIsStructured(false);
        setScrapedContentError('Full paper content is not available.');
      }
    } catch (error) {
      console.error('Error fetching paper content:', error);
      setScrapedContentError('Failed to load full paper content.');
    } finally {
      setScrapedContentLoading(false);
    }
  };
  const handleListClick = (listId: number) => {
    setSelectedListId(listId);
    setKeywordResults([]);
    setLastKeywordQuery('');
    setLastYearQuery(null);
    setKeywordError('');
    fetchListItems(listId);
    // Clear selected paper or set to first item once loaded
    setSelectedPaper(null);
  };

  const handleOrcidSave = async () => {
    if (!user) {
      authModal.openSignup();
      return;
    }

    const trimmedOrcid = profileFormOrcid.trim();

    if (!trimmedOrcid) {
      setProfileEnrichmentError('Please enter your ORCID ID to generate keywords.');
      return;
    }

    const orcidValidation = validateOrcidId(trimmedOrcid);
    if (!orcidValidation.isValid) {
      setProfileEnrichmentError(orcidValidation.message || 'Please enter a valid ORCID ID.');
      return;
    }

    const normalizedOrcid = normalizeOrcidId(trimmedOrcid);

    try {
      setProfileEnrichmentError('');
      setProfileEnrichmentLoading(true);

      // Create a simple API call to generate keywords from ORCID
      const response = await fetch('/api/profile/keywords-from-orcid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orcidId: normalizedOrcid,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate keywords from ORCID.');
      }

      const result = await response.json();

      // Combine generated keywords with existing keywords
      if (result.keywords && result.keywords.length > 0) {
        // Get existing keywords
        const existingKeywords = parseManualKeywords(profileManualKeywords);

        // Combine and deduplicate (case-insensitive)
        const allKeywords = [...existingKeywords];
        const lowerCaseExisting = existingKeywords.map(k => k.toLowerCase());

        for (const newKeyword of result.keywords) {
          if (!lowerCaseExisting.includes(newKeyword.toLowerCase())) {
            allKeywords.push(newKeyword);
            lowerCaseExisting.push(newKeyword.toLowerCase());
          }
        }

        setProfileManualKeywords(allKeywords.join('\n'));
        setProfileEnrichmentError('');
      } else {
        setProfileEnrichmentError('No keywords could be generated from your ORCID profile.');
      }

    } catch (error) {
      if (error instanceof Error) {
        // Only log technical errors to console, not user-facing ones
        if (!error.message.includes('ORCID ID not found') &&
            !error.message.includes('No publications found') &&
            !error.message.includes('ORCID API error')) {
          console.error('ORCID keyword generation error', error);
        }
        setProfileEnrichmentError(error.message);
      } else {
        console.error('ORCID keyword generation error', error);
        setProfileEnrichmentError('Failed to generate keywords from ORCID. Please try again.');
      }
    } finally {
      setProfileEnrichmentLoading(false);
    }
  };

  const handleWebsiteSave = async () => {
    if (!user) {
      authModal.openSignup();
      return;
    }

    const trimmedWebsite = profileFormWebsite.trim();

    if (!trimmedWebsite) {
      setProfileEnrichmentError('Please enter your academic website URL to generate keywords.');
      return;
    }

    // Basic URL validation
    if (!trimmedWebsite.match(/^(https?:\/\/)?([\w\-]+\.)+[\w\-]+(\/.*)?$/i)) {
      setProfileEnrichmentError('Please enter a valid website URL.');
      return;
    }

    try {
      setProfileEnrichmentError('');
      setWebsiteScrapingLoading(true);

      // Create a simple API call to generate keywords from website
      const response = await fetch('/api/profile/keywords-from-website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteUrl: trimmedWebsite,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate keywords from website.');
      }

      const result = await response.json();

      // Combine generated keywords with existing keywords
      if (result.keywords && result.keywords.length > 0) {
        // Get existing keywords
        const existingKeywords = parseManualKeywords(profileManualKeywords);

        // Combine and deduplicate (case-insensitive)
        const allKeywords = [...existingKeywords];
        const lowerCaseExisting = existingKeywords.map(k => k.toLowerCase());

        for (const newKeyword of result.keywords) {
          if (!lowerCaseExisting.includes(newKeyword.toLowerCase())) {
            allKeywords.push(newKeyword);
            lowerCaseExisting.push(newKeyword.toLowerCase());
          }
        }

        setProfileManualKeywords(allKeywords.join('\n'));
        setProfileEnrichmentError('');
      } else {
        setProfileEnrichmentError('No keywords could be generated from your website.');
      }

    } catch (error) {
      if (error instanceof Error) {
        // Only log technical errors to console, not user-facing ones
        if (!error.message.includes('Website returned status') &&
            !error.message.includes('Invalid URL') &&
            !error.message.includes('Could not extract')) {
          console.error('Website keyword generation error', error);
        }
        setProfileEnrichmentError(error.message);
      } else {
        console.error('Website keyword generation error', error);
        setProfileEnrichmentError('Failed to generate keywords from website. Please try again.');
      }
    } finally {
      setWebsiteScrapingLoading(false);
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

    setProfileSaveError('');

    // ORCID is now optional
    let normalizedOrcid = null;
    if (trimmedOrcid) {
      const orcidValidation = validateOrcidId(trimmedOrcid);
      if (!orcidValidation.isValid) {
        setProfileSaveError(orcidValidation.message || 'Please enter a valid ORCID ID.');
        return;
      }
      normalizedOrcid = normalizeOrcidId(trimmedOrcid);
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

    // Smart keyword change detection (normalized comparison)
    const normalizeKeywordsForComparison = (keywords: string[]) =>
      keywords.map(k => k.toLowerCase().trim()).sort().join('|');
    const normalizeKeyword = (keyword: string) => keyword.trim().toLowerCase();

    const oldKeywords = profile?.profile_personalization?.manual_keywords || [];
    const keywordsChanged = normalizeKeywordsForComparison(oldKeywords) !== normalizeKeywordsForComparison(parsedManualKeywords);
    const oldKeywordSet = new Set(oldKeywords.map(normalizeKeyword).filter(Boolean));
    const newlyAddedKeywords = keywordsChanged
      ? parsedManualKeywords.filter(keyword => !oldKeywordSet.has(normalizeKeyword(keyword)))
      : [];

    // Debug logging for keyword comparison
    console.log('[profile-save] Keyword comparison:');
    console.log('  Old keywords:', oldKeywords);
    console.log('  New keywords:', parsedManualKeywords);
    console.log('  Old normalized:', normalizeKeywordsForComparison(oldKeywords));
    console.log('  New normalized:', normalizeKeywordsForComparison(parsedManualKeywords));
    console.log('  Keywords changed:', keywordsChanged);
    if (keywordsChanged) {
      console.log('  Newly added keywords:', newlyAddedKeywords);
    }

    const orcidChanged = (profile?.orcid_id || null) !== normalizedOrcid;
    const websiteChanged = (profile?.academic_website || null) !== (normalizedWebsite || null);
    const hasChanges = keywordsChanged || orcidChanged || websiteChanged;

    setProfileSaving(true);
    if (hasChanges) {
      setProfileSaveLoading(true);
    }

    try {
      const supabase = createClient();

      // Create simple personalization from manual keywords
      const simplePersonalization = {
        topic_clusters: parsedManualKeywords.slice(0, 5).map((keyword, index) => ({
          id: `manual-${index + 1}`,
          label: keyword.charAt(0).toUpperCase() + keyword.slice(1),
          keywords: [keyword],
          priority: index + 1,
          source: 'manual' as const,
        })),
        author_focus: [],
        venue_focus: [],
        manual_keywords: parsedManualKeywords,
        filters: {
          recency_days: 7,
          publication_types: ['journal', 'conference', 'preprint'] as ('journal' | 'conference' | 'preprint' | 'dataset' | 'patent')[],
          include_preprints: true,
        },
      };

      // Use upsert for safer, cleaner profile save
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          orcid_id: normalizedOrcid,
          academic_website: normalizedWebsite || null,
          profile_personalization: simplePersonalization,
          last_profile_enriched_at: new Date().toISOString(),
          profile_enrichment_version: 'manual-v1',
        }, {
          onConflict: 'id'
        });

      if (profileError) {
        console.error('Profile update failed:', {
          error: profileError,
          errorMessage: profileError.message,
          errorCode: profileError.code,
          errorDetails: profileError.details,
          errorHint: profileError.hint,
        });

        // Check for ORCID unique constraint violation
        if (profileError.code === '23505' && profileError.message?.includes('profiles_orcid_unique')) {
          setProfileSaveError('This ORCID ID is already registered to another account. Please verify your ORCID ID.');
        } else {
          setProfileSaveError('We could not save your research profile. Please try again.');
        }
        return;
      }

      // Upsert researcher record for script-based feed population
      const displayName = user.user_metadata?.full_name || user.email || 'Anonymous Researcher';
      const researcherStatus = parsedManualKeywords.length > 0 ? 'active' : 'paused';

      const researcherRecord = {
        id: user.id,
        display_name: displayName,
        contact_email: user.email,
        research_interests: parsedManualKeywords,
        status: researcherStatus,
      };

      const { data: researcherData, error: researcherError } = await supabase
        .from('researchers')
        .upsert(researcherRecord, {
          onConflict: 'id'
        })
        .select();

      if (researcherError) {
        console.error('Researcher record update failed (non-critical):', {
          error: researcherError,
          errorMessage: researcherError.message,
          errorDetails: researcherError.details,
          errorHint: researcherError.hint,
          recordAttempted: researcherRecord
        });
        // Don't block the save - this is for background script only
      }

      setProfile((previous) => ({
        ...previous,
        orcid_id: normalizedOrcid,
        academic_website: normalizedWebsite || null,
        profile_personalization: simplePersonalization,
        last_profile_enriched_at: new Date().toISOString(),
        profile_enrichment_version: 'manual-v1',
      }));

      // Reset editing modes
      setOrcidEditingMode(false);
      setWebsiteEditingMode(false);

      // Close the profile editor modal on successful save
      closeProfileEditor();

      // Only run feed population if keywords actually changed
      if (keywordsChanged && parsedManualKeywords.length > 0) {
        if (newlyAddedKeywords.length > 0) {
          const keywordsForPopulation = newlyAddedKeywords.slice(0, 5);
          console.log('[profile-save] Keywords changed - triggering feed population for new keywords:', keywordsForPopulation);

          // Set up personal feed view for incoming results
          setSelectedListId(null);
          setListItems([]);
          setYearQuery('');
          setKeywordQuery('');
          setLastKeywordQuery(PERSONAL_FEED_LABEL);
          setLastYearQuery(null);
          setKeywordResults([]); // Clear existing results
          setSelectedPaper(null);

          // Trigger populate endpoint (fire and forget - don't block profile save)
          fetch('/api/personal-feed/populate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords: keywordsForPopulation })
          }).catch(err => {
            console.error('[profile-save] Background population failed:', err);
          });

          // Start polling to show progressive results
          setTimeout(() => {
            startFeedPolling();
          }, 500); // Small delay to let populate endpoint start
        } else {
          console.log('[profile-save] Keywords changed but no new keywords detected - refreshing existing feed');
          setTimeout(() => {
            handleRefreshPersonalFeed();
          }, 300);
        }
      } else if (parsedManualKeywords.length > 0) {
        // Keywords didn't change, just show existing feed
        console.log('[profile-save] Keywords unchanged - showing existing feed');
        setTimeout(() => {
          handleRefreshPersonalFeed();
        }, 300);
      }
    } catch (error) {
      console.error('Unexpected profile update error', error);
      setProfileSaveError('Something went wrong while saving. Please try again.');
    } finally {
      setProfileSaving(false);
      if (hasChanges) {
        setProfileSaveLoading(false);
      }
    }
  };

  const handleAccountDropdownToggle = useCallback(() => {
    setAccountDropdownVisible((previous) => !previous);
  }, []);

  const handleProfileEdit = useCallback(() => {
    setAccountDropdownVisible(false);
    setProfileEnrichmentError('');
    setProfileEditorVisible(true);
  }, []);

  const handleSignOut = useCallback(() => {
    setAccountDropdownVisible(false);
    // Clear all user-specific cached data on sign out
    if (user) {
      try {
        const userCacheKeys = [
          `${PERSONAL_FEED_CACHE_KEY}-${user.id}`,
          `${LIST_METADATA_CACHE_KEY}-${user.id}`,
          `${LIST_ITEMS_CACHE_KEY}-${user.id}`
        ];

        Object.keys(localStorage).forEach(key => {
          // Clear any cache entries that start with user-specific keys
          if (userCacheKeys.some(cacheKey => key.startsWith(cacheKey))) {
            clearCachedData(key);
          }
        });

        // Clear memory cache as well
        setCachedListItems(new Map());
      } catch (error) {
        console.warn('Failed to clear cache on sign out:', error);
      }
    }
    signOut();
  }, [signOut, user]);

  const openProfileEditor = useCallback(() => {
    setProfileEnrichmentError('');
    setProfileEditorVisible(true);
  }, []);

  const closeProfileEditor = useCallback(() => {
    setProfileEnrichmentError('');
    setProfileManualKeywords(''); // Clear keywords so they re-seed from profile on next open
    setManualKeywordsSeededVersion(null);
    setProfileEditorVisible(false);
  }, []);

  return (
    <div className={SHELL_CLASSES}>
      <main className="mx-auto flex w-full flex-1 flex-col gap-4 px-3 py-6 xl:px-6 min-h-0">
        <div className="relative flex flex-1 flex-col gap-4 xl:flex-row xl:gap-5 min-h-0 xl:overflow-hidden">
          <aside
            className="relative flex min-h-0 flex-col transition-all duration-300 ease-in-out xl:basis-[22%] xl:max-w-[22%] xl:h-full xl:overflow-y-auto xl:pr-2 xl:border-r xl:border-slate-200/70"
          >
            <div
              className={`${SIDEBAR_CARD_CLASSES} xl:transition-all xl:duration-300 xl:ease-out xl:translate-x-0 xl:opacity-100`}
            >
              {user ? (
                <>
                  <div className="flex w-full flex-wrap items-center gap-3 sm:flex-nowrap sm:justify-between">
                    <div className="flex-shrink-0">
                      <span className="text-sm font-bold uppercase tracking-[0.2em] text-slate-600">Evidentia</span>
                    </div>
                    <div className="relative w-full sm:w-auto" ref={accountDropdownRef}>
                      <button
                        type="button"
                        onClick={handleAccountDropdownToggle}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:w-auto"
                        aria-expanded={accountDropdownVisible}
                      >
                        <User className="h-4 w-4" />
                        Account
                      </button>

                      {accountDropdownVisible && (
                        <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-slate-200 bg-white shadow-sm">
                          <button
                            type="button"
                            onClick={handleProfileEdit}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                          >
                            <UserCog className="h-4 w-4" />
                            Edit Profile
                          </button>
                          <button
                            type="button"
                            onClick={handleSignOut}
                            className="flex w-full items-center gap-2 border-t border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                          >
                            <LogOut className="h-4 w-4" />
                            Sign Out
                          </button>
                        </div>
                      )}

                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRefreshPersonalFeed()}
                    className={`rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-100 ${
                      shouldShowPersonalFeed
                        ? 'border-sky-400 bg-sky-100 ring-2 ring-sky-300 shadow-sm'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        <Rss className={`h-5 w-5 ${shouldShowPersonalFeed ? 'text-sky-700' : 'text-slate-600'}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${shouldShowPersonalFeed ? 'text-sky-900' : 'text-slate-900'}`}>Your Personal Feed</p>
                        <p className={`text-xs mt-1 ${shouldShowPersonalFeed ? 'text-sky-700' : 'text-slate-600'}`}>Click to view today&rsquo;s personalised content</p>
                      </div>
                    </div>
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
                              className={`flex w-full flex-col gap-2 rounded-lg border p-3 text-left text-sm transition sm:flex-row sm:items-center sm:justify-between ${
                                isSelected
                                  ? 'border-sky-400 bg-sky-100 ring-2 ring-sky-300 shadow-sm'
                                  : isLoadingList
                                    ? 'border-sky-400 bg-sky-100 cursor-wait shadow-sm'
                                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                              }`}
                            >
                              <span className={`font-medium ${isSelected ? 'text-sky-900' : isLoadingList ? 'text-sky-800' : 'text-slate-900'}`}>
                                {list.name}
                              </span>
                              <span className={`text-xs ${isSelected ? 'text-sky-700' : 'text-slate-500'} sm:text-right`}>
                                {isLoadingList ? (
                                  <span className="flex items-center gap-2 text-sky-700 font-medium">
                                    <span
                                      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-sky-700 border-t-transparent"
                                      aria-hidden="true"
                                    />
                                    Researching…
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
                  <div className="flex flex-wrap items-center gap-3 sm:justify-between">
                    <div className="space-y-1">
                      <span className="text-sm font-bold uppercase tracking-[0.2em] text-slate-600">Evidentia</span>
                    </div>
                    <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                      <button
                        type="button"
                        onClick={authModal.openLogin}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:w-auto"
                        aria-label="Sign in"
                      >
                        <User className="h-4 w-4" />
                        Login
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3 text-sm text-slate-600">
                    <p>Sign in to access your personal research feed and save papers to custom lists.</p>
                  </div>
                </>
              )}
            </div>
          </aside>

          <section
            className={`min-h-0 min-w-0 transition-all duration-300 ${FEED_CARD_CLASSES} xl:basis-[40%] xl:h-full xl:overflow-y-auto 2xl:basis-[38%]`}
          >

            <header className="flex flex-col gap-0">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                </div>
              </div>

              <form id="keyword-search-form" onSubmit={handleKeywordSearch} className="relative">
                <div className={SEARCH_CONTAINER_CLASSES}>
                  <div className="flex w-full items-center sm:flex-1">
                    <input
                      type="text"
                      value={keywordQuery}
                      onChange={(e) => {
                        const value = e.target.value;
                        setKeywordQuery(value);
                        // Clear year when search input is completely cleared
                        if (!value.trim()) {
                          setYearQuery('');
                        }
                      }}
                      placeholder="Find the knowledge the papers leave out"
                      className={SEARCH_INPUT_CLASSES}
                    />
                  </div>
                  <div className="hidden h-10 w-px bg-slate-200 sm:block" />
                  <div className="h-px w-full bg-slate-200 sm:hidden" />
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-0">
                    <input
                      type="number"
                      value={yearQuery}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow 4-digit years or empty
                        if (value === '' || (value.length <= 4 && /^\d+$/.test(value))) {
                          setYearQuery(value);
                        }
                      }}
                      placeholder="Year"
                      min="1900"
                      max={new Date().getFullYear() + 2}
                      className={`${SEARCH_YEAR_INPUT_CLASSES} rounded-xl border border-slate-200 text-center sm:rounded-none sm:border-0`}
                    />
                    <div className="hidden h-10 w-px bg-slate-200 sm:block" />
                    <div className="h-px w-full bg-slate-200 sm:hidden" />
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
                </div>
              </form>

              <div className={FILTER_BAR_CLASSES}>
                {user && hasKeywords && !isPersonalFeedActive && (keywordResults.length > 0 || lastKeywordQuery) && (
                  <button
                    onClick={() => handleRefreshPersonalFeed()}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
                    title="Back to Personal Feed"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                )}
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
              ) : profileNeedsSetup && !isSearchContext && !isListViewActive ? (
                <div className={PROFILE_CARD_CLASSES}>
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-sky-600">Research profile</span>
                    <h2 className="text-2xl font-semibold text-slate-900">Personalise your feed</h2>
                    <p className="text-sm text-slate-600">
                      Add your ORCID ID and keywords to personalise your feed with AI-powered recommendations.
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
            className={`min-h-0 min-w-0 transition-all duration-300 ${DETAIL_SHELL_CLASSES} xl:basis-[38%] xl:h-full xl:overflow-y-auto xl:pl-2 xl:border-l xl:border-slate-200/70 2xl:basis-[40%]`}
          >
            {selectedPaper ? (
              <>
                {/* Share Discovery */}
                <div className="hidden px-4 pb-3 sm:block">
                  <div className={SEARCH_CONTAINER_CLASSES}>
                    <div className="flex w-full items-center">
                      <input
                        type="text"
                        disabled
                        placeholder="Share your wisdom to help science"
                        className={`${SEARCH_INPUT_CLASSES} disabled:cursor-not-allowed disabled:text-slate-500`}
                      />
                    </div>
                    <div className="hidden h-10 w-px bg-slate-200 sm:block" />
                    <div className="h-px w-full bg-slate-200 sm:hidden" />
                    <button
                      type="button"
                      disabled
                      className={`${SEARCH_BUTTON_CLASSES} disabled:cursor-not-allowed disabled:opacity-70`}
                    >
                      Share
                    </button>
                  </div>
                </div>

                <div className="flex flex-col space-y-6 px-4 pb-6 flex-1 min-h-0">
                  <div className={`${DETAIL_HERO_CLASSES} flex flex-col gap-4`} data-tutorial="paper-hero">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-sky-600">Paper details</p>
                        {metaSummary && (
                          <p className="text-xs text-slate-600">{metaSummary}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveSelectedPaper}
                        className={DETAIL_SAVE_BUTTON_CLASSES}
                      >
                        Save to List
                      </button>
                    </div>
                    <h2 className="text-2xl font-semibold text-slate-900" data-tutorial="paper-title">{selectedPaper.title}</h2>
                    <div className="flex justify-center sm:justify-end">
                      {verificationButtons}
                    </div>
                  </div>

                  <section className="space-y-4">
                    {verificationView === 'paper' && (
                      <div className="space-y-4" data-tutorial="paper-overview">
                        {/* DOI/External links */}
                        {selectedPaperPrimaryLink && (
                          <div className={DETAIL_METADATA_CLASSES}>
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
                          </div>
                        )}

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
                      </div>
                    )}

                    {verificationView === 'similar' && (
                      <div className="space-y-6" data-tutorial="similar-papers-panel">
                        {compiledSimilarPapers.length > 0 ? (
                          <div className="space-y-6">
                            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <h4 className="text-sm font-semibold text-slate-900">
                                    Method &amp; Finding Crosswalk
                                  </h4>
                                  <p className="text-xs text-slate-500">
                                    Scan how each paper handles the key experimental dimensions.
                                  </p>
                                </div>
                                {lifeSciencesMatrixRows.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setIsCrosswalkModalOpen(true)}
                                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                                  >
                                    View full matrix
                                  </button>
                                )}
                              </div>
                              {lifeSciencesMatrixRows.length === 0 ? (
                                <div className="px-5 py-6 text-sm text-slate-500">
                                  No structured comparison is available for these papers yet.
                                </div>
                              ) : (
                                <div className="divide-y divide-slate-200">
                                  {lifeSciencesMatrixRows.map(row => {
                                    const isOpen = openCrosswalkRowKey === row.key;
                                    const panelId = `crosswalk-${row.key}`;

                                    return (
                                      <div key={row.key}>
                                        <button
                                          type="button"
                                          onClick={() => handleCrosswalkRowToggle(row.key)}
                                          className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-4 text-left transition hover:bg-slate-50 sm:flex-nowrap sm:gap-4"
                                          aria-expanded={isOpen}
                                          aria-controls={panelId}
                                        >
                                          <span className="text-sm font-semibold text-slate-900">
                                            {row.label}
                                          </span>
                                          <ChevronDown
                                            className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : 'rotate-0'}`}
                                            aria-hidden="true"
                                          />
                                        </button>
                                        {isOpen && (
                                          <div id={panelId} className="space-y-4 bg-slate-50/60 px-5 pb-5">
                                            {compiledSimilarPapers.map((paper, paperIndex) => {
                                              const value = row.values[paperIndex] ?? 'Not reported';
                                              const isMissing = !value || value === 'Not reported';

                                              return (
                                                <div
                                                  key={paper.id}
                                                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                                                >
                                                  <div className="flex flex-col gap-1">
                                                    <p className="text-sm font-semibold leading-snug text-slate-900">
                                                      {paper.title}
                                                    </p>
                                                    <span className="text-xs font-medium text-slate-500">
                                                      {paper.venue} • {paper.year} • {formatCitationCount(paper.citationCount)}
                                                    </span>
                                                  </div>
                                                  {isMissing ? (
                                                    <span className="mt-3 inline-flex items-center rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                                                      Not reported
                                                    </span>
                                                  ) : (
                                                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                                                      {value}
                                                    </p>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <div className="space-y-4">
                              {compiledSimilarPapers.map((paper) => {
                                const saveState = similarPaperSaveState[paper.id];
                                const saveStatus = saveState?.status ?? 'idle';
                                const isSaving = saveStatus === 'saving';
                                const message = saveState?.message;

                                return (
                                  <article
                                    key={paper.id}
                                    className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                                  >
                                    <div className="space-y-2">
                                      <h4 className="text-lg font-semibold text-slate-900">{paper.title}</h4>
                                      <p className="text-sm text-slate-600">{paper.authors}</p>
                                      <p className="text-xs font-medium text-slate-500">
                                        {paper.venue} • {paper.year} • {formatCitationCount(paper.citationCount)}
                                      </p>
                                    </div>
                                    <p className="mt-4 text-sm leading-relaxed text-slate-600">{paper.summary}</p>
                                    <div className="mt-4 rounded-2xl bg-emerald-50/70 p-4 text-sm text-emerald-800 shadow-inner">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Why it matters</p>
                                      <p className="mt-2 leading-relaxed">{paper.highlight}</p>
                                    </div>
                                    <div className="mt-4 flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleSimilarPaperSaveClick(paper)}
                                        className="inline-flex items-center justify-center rounded-lg border border-transparent bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                                        disabled={isSaving}
                                      >
                                        {isSaving ? 'Saving…' : 'Save to reading list'}
                                      </button>
                                    </div>
                                    {saveStatus === 'saving' && (
                                      <p className="mt-2 text-xs text-slate-500">Saving to your list…</p>
                                    )}
                                    {saveStatus === 'success' && message && (
                                      <p className="mt-2 text-xs font-medium text-emerald-600">{message}</p>
                                    )}
                                    {saveStatus === 'already' && message && (
                                      <p className="mt-2 text-xs font-medium text-emerald-600">{message}</p>
                                    )}
                                    {saveStatus === 'error' && message && (
                                      <p className="mt-2 text-xs font-medium text-rose-600">{message}</p>
                                    )}
                                  </article>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
                            We will surface adjacent literature here once the compilation finishes.
                          </div>
                        )}
                      </div>
                    )}

                    {verificationView !== 'paper' && verificationView !== 'similar' && (
                      <div id="verification-panel" className="space-y-4">
                        {hasSelectedPaper ? (
                        verificationRequestStatus === 'error' ? (
                          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-600">
                            <p className="text-sm font-semibold text-rose-700">We could not send this request</p>
                            <p className="mt-2 leading-relaxed">
                              {verificationRequestError || 'Please try again in a moment.'}
                            </p>
                          </div>
                        ) : verificationRequestStatus === 'sending' || verificationSummaryLoading ? (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-5 text-center text-sm text-slate-600">
                            {verificationRequestStatus === 'sending' ? 'Sending your request…' : 'Checking verification status…'}
                          </div>
                        ) : (() => {
                          const fallbackReport =
                            latestVerificationRequest && latestVerificationRequest.result_summary && typeof latestVerificationRequest.result_summary === 'object'
                              ? (latestVerificationRequest.result_summary as ResearchPaperAnalysis)
                              : null;

                          const activeReport = reproducibilityReport ?? fallbackReport;

                          if (activeReport) {
                            return <StaticReproReport report={activeReport} />;
                          }

                          if (latestVerificationRequest) {
                        const status = latestVerificationRequest.status;
                        const statusLabel = status.replace('_', ' ');
                        let statusMessage = 'The request is recorded. We will follow up with the full briefing shortly.';
                        if (status === 'pending' || status === 'in_progress') {
                          statusMessage = 'Agent is searching this now. We will email you once the search is complete.';
                        } else if (status === 'completed') {
                          statusMessage = 'The analysis is complete.';
                        } else if (status === 'cancelled') {
                          statusMessage = 'This request was cancelled. Re-run the briefing if you need a fresh analysis.';
                        }

                        return (
                          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-700">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">Verification briefing in progress</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Submitted {formatRelativeTime(latestVerificationRequest.created_at)} • Status: {statusLabel}
                                </p>
                              </div>
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                                Reproducibility view
                              </span>
                            </div>
                            <p className="mt-4 leading-relaxed">{statusMessage}</p>
                          </div>
                        );
                      }

                      return (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
                          Choose a verification track above to request a briefing.
                        </div>
                      );
                    })()
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
                      Select a paper from the feed to generate its reproducibility briefing.
                    </div>
                  )}
                      </div>
                    )}

                {/* Action buttons - moved above scraped content */}
                {selectedPaper.id.startsWith('sample-') && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleViewFullPaper}
                      disabled={scrapedContentLoading}
                      className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {scrapedContentLoading ? (
                        <>
                          <span className="animate-spin">⏳</span>
                          Loading Full Paper...
                        </>
                      ) : (
                        <>
                          Add to Paper
                        </>
                      )}
                    </button>
                    {selectedPaper.arxivId && (
                      <a
                        href={`https://arxiv.org/pdf/${selectedPaper.arxivId}.pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
                      >
                        Open PDF
                      </a>
                    )}
                  </div>
                )}

                {/* Scraped content section */}
                {scrapedContent && (
                  <div>
                    {scrapedContentIsStructured ? (
                      <ProcessedPaperContent processedContent={scrapedContent} />
                    ) : (
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Full Paper</h3>
                        <div className="mt-2 prose prose-slate prose-sm max-w-none prose-headings:text-slate-900 prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-p:text-slate-700 prose-p:leading-relaxed prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-code:text-slate-800 prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-50 prose-pre:border prose-pre:border-slate-200 prose-blockquote:border-l-blue-500 prose-blockquote:bg-blue-50 prose-blockquote:py-2 prose-blockquote:px-3">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                          >
                            {scrapedContent}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {scrapedContentError && (
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Full Paper</h3>
                    <div className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
                      {scrapedContentError}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </>
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
      <CrosswalkMatrixModal
        isOpen={isCrosswalkModalOpen}
        onClose={() => setIsCrosswalkModalOpen(false)}
        rows={lifeSciencesMatrixRows}
        papers={compiledSimilarPapers}
      />

      {/* Auth Modal */}
      <VerificationModal
        isOpen={verificationModalOpen}
        type={activeVerificationRequestType}
        status={verificationRequestStatus}
        errorMessage={verificationRequestError}
        onClose={handleVerificationModalClose}
      />
      <AuthModal
        isOpen={authModal.isOpen}
        mode={authModal.mode}
        onClose={handleAuthModalClose}
        onSwitchMode={authModal.switchMode}
      />
      {/* Tour Prompt Modal */}
      <TourPromptModal
        isOpen={showTourPrompt}
        onYes={handleTourPromptYes}
        onNo={handleTourPromptNo}
      />
      {/* Welcome Modal */}
      <WelcomeModal
        isOpen={showWelcomeModal}
        onSave={handleSaveWelcomeNames}
      />
      {/* ORCID Search Modal */}
      <OrcidSearchModal
        isOpen={showOrcidSearchModal}
        firstName={profile?.first_name || ''}
        lastName={profile?.last_name || ''}
        onSelect={handleSelectOrcid}
        onSkip={handleSkipOrcid}
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
      {profileEditorVisible && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Profile settings</h2>
                <p className="text-xs text-slate-500">Keep your recommendations current.</p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
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
              {profileEnrichmentError && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                  {profileEnrichmentError}
                </div>
              )}
              {renderProfileForm(true)}
            </div>
          </div>
        </div>
      )}
      {/* Onboarding Tutorial */}
      <OnboardingTutorial
        isOpen={tutorialOpen}
        onClose={handleTutorialClose}
        onSignUp={handleTutorialSignUp}
        onStepChange={handleTutorialStepChange}
      />
    </div>
  )
}
