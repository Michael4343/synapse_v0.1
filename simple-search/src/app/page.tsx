'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogOut, Rss, User, UserCog, X, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useAuthModal, getUserDisplayName } from '../lib/auth-hooks';
import { createClient } from '../lib/supabase';
import { AuthModal } from '../components/auth-modal';
import { VerificationModal } from '../components/verification-modal';
import type { ProfilePersonalization, UserProfile } from '../lib/profile-types';
import { SaveToListModal } from '../components/save-to-list-modal';
import { buildVerifyListName, savePaperToNamedList } from '../lib/list-actions';
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

type VerificationRequestType = 'combined';
type VerificationTrack = 'claims' | 'reproducibility';

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
  criticalPath?: Array<{
    id: string;
    name: string;
    deliverable: string;
    checklist: string[];
    primaryRisk?: {
      severity: string;
      issue: string;
      mitigation: string;
    };
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
  },
  {
    id: 'fc448a7db5a2fac242705bd8e37ae1fc4a858643',
    title: 'Initial sequencing and analysis of the human genome.',
    abstract: 'The human genome holds an extraordinary trove of information about human development, physiology, medicine and evolution. Here we report the results of an international collaboration to produce and make freely available a draft sequence of the human genome. We also present an initial analysis of the data, describing some of the insights that can be gleaned from the sequence. The development of the human genome project, the generation of a draft sequence, and the nature of the sequence itself are described, as well as an analysis of the human genome sequence.',
    authors: ['E. Lander', 'L. Linton', 'B. Birren', 'C. Nusbaum', 'M. Zody', 'J. Baldwin', 'K. Devon', 'K. Dewar', 'M. Doyle', 'W. Fitzhugh', 'R. Funke', 'D. Gage', 'K. Harris', 'A. Heaford', 'J. Howland', 'L. Kann', 'J. Lehoczky', 'R. Levine', 'P. McEwan', 'K. McKernan', 'J. Meldrim', 'J. Mesirov', 'C. Miranda', 'W. Morris', 'J. Naylor', 'C. Raymond', 'M. Rosetti', 'R. Santos', 'A. Sheridan', 'C. Sougnez'],
    year: 2001,
    venue: 'Nature',
    citationCount: 13848,
    semanticScholarId: 'fc448a7db5a2fac242705bd8e37ae1fc4a858643',
    arxivId: null,
    doi: '10.1038/35057062',
    url: 'https://www.semanticscholar.org/paper/fc448a7db5a2fac242705bd8e37ae1fc4a858643',
    source: 'semantic_scholar',
    publicationDate: '2001-02-15'
  }
]

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
  reproducibilityReport: ResearchPaperAnalysis | null
  claimsReport: ResearchPaperAnalysis | null
}

const SHELL_CLASSES = 'min-h-screen bg-slate-50 text-slate-900 flex flex-col xl:h-screen xl:overflow-hidden';
const FEED_CARD_CLASSES = 'flex h-full min-h-0 flex-col space-y-6 px-2 pt-4 pb-12 xl:px-4 xl:pb-16';
const DETAIL_SHELL_CLASSES = 'flex h-full min-h-0 flex-col space-y-6 px-2 pt-4 pb-12 xl:px-4 xl:pb-16';
const DETAIL_HERO_CLASSES = 'rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-4 shadow-inner';
const TILE_BASE_CLASSES = 'group relative flex cursor-pointer flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 transition duration-150 hover:border-slate-300 hover:bg-slate-50 max-h-[400px] overflow-y-auto';
const TILE_SELECTED_CLASSES = 'border-sky-400 bg-sky-50 ring-1 ring-sky-100';
const FEED_LOADING_WRAPPER_CLASSES = 'relative flex flex-col gap-3';
const FEED_SPINNER_CLASSES = 'inline-block h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent';
const FEED_LOADING_PILL_CLASSES = 'inline-flex items-center gap-2 self-start rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-600 shadow-sm';
const SEARCH_CONTAINER_CLASSES = 'relative flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm';
const SEARCH_INPUT_CLASSES = 'w-full bg-transparent px-5 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none';
const SEARCH_BUTTON_CLASSES = 'mr-2 inline-flex items-center rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-sky-400';
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
const SIDEBAR_PRIMARY_BUTTON_CLASSES = 'flex items-center justify-center rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(56,189,248,0.2)] transition hover:-translate-y-0.5 hover:bg-sky-400';
const SIDEBAR_SECONDARY_BUTTON_CLASSES = 'flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900';
const SEARCH_SPINNER_CLASSES = 'inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent';
const DETAIL_SAVE_BUTTON_CLASSES = 'inline-flex items-center justify-center rounded-lg border border-sky-200 px-6 sm:px-8 py-2 text-xs font-semibold uppercase tracking-wide text-sky-700 transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50';
const DETAIL_REPRO_BUTTON_CLASSES = 'inline-flex items-center justify-center rounded-lg border border-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-sky-700 transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50';
const DETAIL_VERIFY_BUTTON_ACTIVE_CLASSES = 'border-sky-400 bg-sky-50 text-sky-900 shadow-[0_12px_28px_rgba(56,189,248,0.25)] ring-2 ring-offset-2 ring-sky-200';
const PROFILE_CARD_CLASSES = 'rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_25px_60px_rgba(15,23,42,0.08)]';
const ACCOUNT_ICON_BUTTON_CLASSES = 'inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900';
const PROFILE_LABEL_CLASSES = 'text-sm font-medium text-slate-700';
const PROFILE_INPUT_CLASSES = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100';
const PROFILE_PRIMARY_BUTTON_CLASSES = 'inline-flex items-center justify-center rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60';
const PROFILE_COMING_SOON_HINT_CLASSES = 'text-xs font-medium text-slate-400';
const PROFILE_DISABLED_UPLOAD_BUTTON_CLASSES = 'flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed';

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
    criticalPath: [
      {
        id: 'compound',
        name: 'Compound sourcing and quality control',
        deliverable: 'Validated compound panel',
        checklist: ['Confirm vendor availability', 'Set up HPLC and mass spec QC workflow', 'Prepare storage and dosing stocks'],
        primaryRisk: {
          severity: 'moderate',
          issue: 'Lead compounds currently on allocation with a six-week replenishment lead time.',
          mitigation: 'Engage alternate suppliers noted in the supplement or reserve CRO synthesis capacity early.'
        }
      },
      {
        id: 'models',
        name: 'Neuronal model setup and characterisation',
        deliverable: 'QC validated neurons ready for dosing',
        checklist: ['Differentiate iPSC neurons or thaw VCP mutant lines', 'Benchmark baseline autophagy and proteasome markers'],
        primaryRisk: {
          severity: 'critical',
          issue: 'Differentiation batches drift in proteostasis baseline without tight SOP control.',
          mitigation: 'Adopt the author SOP for maturation days and include internal healthy control lines.'
        }
      },
      {
        id: 'assays',
        name: 'Autophagy and proteasome assays',
        deliverable: 'Flux curves across compound doses',
        checklist: ['High-content imaging pipeline configured', 'Proteasome activity kit validated with controls'],
        primaryRisk: {
          severity: 'moderate',
          issue: 'Compound cytotoxicity window narrows sharply after 48 hours.',
          mitigation: 'Use staggered dosing and viability gates described in the supplement to avoid false positives.'
        }
      },
      {
        id: 'analysis',
        name: 'Data integration and reporting',
        deliverable: 'Integrated autophagy and proteasome report',
        checklist: ['Analysis scripts for proteostasis metrics', 'Predefined QC gates for outlier exclusion'],
        primaryRisk: {
          severity: 'minor',
          issue: 'Normalisation requires internal controls not included in the public data dump.',
          mitigation: 'Recreate control curves from the shared spreadsheets or request raw files via the author contact channel.'
        }
      }
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
    criticalPath: [
      {
        id: 'data-prep',
        name: 'Dataset normalisation and caching',
        deliverable: 'Verified ImageNet shard set',
        checklist: ['Curate 2012 train/val manifest', 'Generate deterministic shuffles', 'Provision NVMe cache'],
        primaryRisk: {
          severity: 'moderate',
          issue: 'Checksum drift or missing images break reproducibility guarantees.',
          mitigation: 'Reconcile with ImageNet metadata archive and store manifest diffs alongside cached shards.'
        }
      },
      {
        id: 'training',
        name: 'Baseline training run',
        deliverable: 'Top-1 / Top-5 accuracy curves',
        checklist: ['Reserve two high-memory GPUs', 'Match the original LR momentum schedule', 'Enable robust checkpointing'],
        primaryRisk: {
          severity: 'critical',
          issue: 'Deviation in learning rate schedule collapses accuracy.',
          mitigation: 'Mirror the original step schedule and validate every 20k iterations to confirm convergence.'
        }
      },
      {
        id: 'benchmark',
        name: 'Evaluation and ablation sweeps',
        deliverable: 'Reproduction metrics with confidence intervals',
        checklist: ['Run deterministic evaluation script', 'Log throughput and memory usage', 'Capture ablation deltas'],
        primaryRisk: {
          severity: 'moderate',
          issue: 'Hardware variance makes throughput comparisons noisy.',
          mitigation: 'Report normalised images/second and compare against a PyTorch reference implementation.'
        }
      }
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
    criticalPath: [
      {
        id: 'flake-harvest',
        name: 'Graphene exfoliation and inspection',
        deliverable: 'Monolayer graphene flakes catalogued',
        checklist: ['Exfoliate onto 300 nm SiO₂', 'Optically screen for monolayers', 'Log candidate flakes with coordinates'],
        primaryRisk: {
          severity: 'moderate',
          issue: 'Flake contamination or wrinkles reduce mobility.',
          mitigation: 'Use clean tape, verify with Raman/AFM, and discard flakes with polymer residue.'
        }
      },
      {
        id: 'pattern',
        name: 'Hall bar patterning and metallisation',
        deliverable: 'Contacted Hall bar devices',
        checklist: ['Spin-coat resist with soft bake', 'Define geometry via e-beam', 'Deposit Cr/Au contacts'],
        primaryRisk: {
          severity: 'critical',
          issue: 'Overexposure or resist scumming damages the flake edge.',
          mitigation: 'Optimise dose on sacrificial flakes and include oxygen descum before metallisation.'
        }
      },
      {
        id: 'anneal',
        name: 'Anneal and electrical characterisation',
        deliverable: 'Mobility curves vs. gate voltage',
        checklist: ['Anneal in forming gas', 'Wire-bond device', 'Sweep gate voltage for mobility extraction'],
        primaryRisk: {
          severity: 'moderate',
          issue: 'Ambient exposure post-anneal reintroduces dopants.',
          mitigation: 'Package devices immediately or work inside a nitrogen glovebox.'
        }
      }
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
  },
  fc448a7db5a2fac242705bd8e37ae1fc4a858643: {
    stage: 'community_feedback',
    lastUpdated: '2024-12-05',
    reviewers: ['Genomics Community Panel'],
    summary: 'Mostly reproducible for large genome centres with automated sequencing pipelines. Main challenge is orchestrating the multi-lab assembly workflow and matching archival reference standards.',
    paper: {
      title: 'Initial sequencing and analysis of the human genome',
      authors: 'Lander et al.',
      venue: 'Nature (2001)',
      doi: '10.1038/35057062'
    },
    feasibilityQuestions: [
      { id: 'platform', question: 'Do you operate high-throughput sequencing instruments or maintain partnerships with a genome centre?', weight: 3, helper: 'The original effort involved multiple capillary sequencing centres; modern equivalents use NovaSeq or PacBio Revio runs.' },
      { id: 'assembly', question: 'Can you run large-scale assembly pipelines with version-controlled reference data?', weight: 2, helper: 'Assembly requires orchestrating Celera-style overlap layout consensus or modern HiFi assemblers with strict metadata tracking.' },
      { id: 'storage', question: 'Is petabyte-scale storage with audit trails available for raw reads and intermediate contigs?', weight: 2, helper: 'Trace files and consensus scaffolds must be retained for reproducibility and regulatory review.' },
      { id: 'annotation', question: 'Do you have a team that can refresh gene annotation and QC against current reference builds?', weight: 1, helper: 'Updates to Ensembl/RefSeq annotations are needed to align with modern gene models.' }
    ],
    criticalPath: [
      {
        id: 'pilot',
        name: 'Pilot sequencing and calibration',
        deliverable: 'Calibrated sequencing runs with QC reports',
        checklist: ['Sequence well-characterised BAC clones', 'Benchmark against NIST genomes', 'Validate base-call accuracy'],
        primaryRisk: {
          severity: 'moderate',
          issue: 'Instrument drift skews quality metrics across centres.',
          mitigation: 'Run recurring calibration against the Genome in a Bottle reference set and share QC dashboards.'
        }
      },
      {
        id: 'assembly',
        name: 'Whole-genome assembly and scaffolding',
        deliverable: 'Consensus assembly with gap catalogue',
        checklist: ['Merge reads across centres', 'Run assembly with documented parameters', 'Annotate remaining gaps/scaffolds'],
        primaryRisk: {
          severity: 'critical',
          issue: 'Metadata mismatches between centres introduce chimeric contigs.',
          mitigation: 'Enforce shared manifest templates and re-run suspect libraries through independent validation.'
        }
      },
      {
        id: 'annotation',
        name: 'Annotation and comparative analysis',
        deliverable: 'Annotated reference genome release',
        checklist: ['Lift over to current gene models', 'Run repeat masking and structural variant calls', 'Publish QC and coverage reports'],
        primaryRisk: {
          severity: 'moderate',
          issue: 'Legacy annotation pipelines do not map cleanly to modern references.',
          mitigation: 'Use Ensembl/RefSeq joint pipelines and document manual curation steps.'
        }
      }
    ],
    evidence: {
      strong: [
        { claim: 'The human genome reference has been independently reassembled multiple times with concordant coverage metrics.', source: 'Telomere-to-Telomere consortium reports (2022)', confidence: 'verified' },
        { claim: 'Shared QC dashboards and reference standards enable cross-centre reproducibility.', source: 'Genome in a Bottle technical documentation', confidence: 'inferred' }
      ],
      gaps: [
        { description: 'Gap closure for centromeric regions remains specialised.', impact: 'Long-read platforms or ultra-long nanopore runs are required for completeness.', severity: 'critical', needsExpert: true },
        { description: 'Data retention policies differ across sequencing centres.', impact: 'Audit trails may be incomplete without unified storage governance.', severity: 'moderate', needsExpert: false }
      ],
      assumptions: [
        'Sequencing centres participate in shared metadata and QC standards.',
        'Long-read or HiFi sequencing is budgeted for repetitive regions.',
        'Dedicated data engineers maintain the assembly pipelines.'
      ]
    }
  }
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter(isNonEmptyString)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (isNonEmptyString(value)) {
    const normalized = value.replace(/\r\n/g, '\n').trim();
    if (normalized.length === 0) {
      return [];
    }

    const rawItems = normalized
      .split(/[;\n\u2022]+/)
      .map((item) => item.replace(/^\s*[-*]\s*/, '').trim())
      .filter((item) => item.length > 0);

    if (rawItems.length > 0) {
      return rawItems;
    }

    return [normalized];
  }
  return [];
}

function StaticReproReport({
  report,
  onRequestReview,
  communityReviewStatus = 'idle',
  communityReviewRequested = false,
  communityReviewError = ''
}: {
  report: ResearchPaperAnalysis;
  onRequestReview?: (source: VerificationTrack) => void;
  communityReviewStatus?: 'idle' | 'sending' | 'success' | 'error';
  communityReviewRequested?: boolean;
  communityReviewError?: string;
}) {
  const questions = useMemo(
    () => (Array.isArray(report.feasibilityQuestions) ? report.feasibilityQuestions : []),
    [report.feasibilityQuestions]
  );
  const criticalPhases = useMemo(
    () => (Array.isArray(report.criticalPath) ? report.criticalPath : []),
    [report.criticalPath]
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

  const isPlaceholder = questions.length === 0 && criticalPhases.length === 0;

  const blockerSeverityTone: Record<string, string> = {
    critical: 'border border-red-200 bg-red-50 text-red-600',
    moderate: 'border border-amber-200 bg-amber-50 text-amber-600',
    minor: 'border border-sky-200 bg-sky-50 text-sky-600'
  };

  if (isPlaceholder) {
    return (
      <div className="space-y-6">
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
            Feasibility questions, critical path analysis, and expert insights will be added for this paper.
          </p>
        </section>
      </div>
    );
  }

  const isSending = communityReviewStatus === 'sending';
  const isComplete = communityReviewRequested || communityReviewStatus === 'success';
  const buttonLabel = isSending ? 'Sending…' : isComplete ? 'Request Received' : 'Request Community Review';

  return (
    <div className="space-y-6">
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

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h4 className="text-base font-semibold text-slate-900">Critical path</h4>
            <p className="mt-1 text-sm text-slate-600">High-level phases with the main output and risk to watch.</p>
          </div>
        </div>
        <div className="mt-6 space-y-5">
          {criticalPhases.map((phase) => {
            const checklist = toStringArray(phase.checklist);
            const primaryBlocker =
              phase.primaryRisk && typeof phase.primaryRisk === 'object' ? phase.primaryRisk : null;
            const severityLabel = primaryBlocker && typeof primaryBlocker.severity === 'string'
              ? primaryBlocker.severity.charAt(0).toUpperCase() + primaryBlocker.severity.slice(1)
              : 'No major risk';

            return (
              <article key={phase.id} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <header className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="mt-1 text-base font-semibold text-slate-900">{phase.name}</p>
                  </div>
                </header>

                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Key deliverable</p>
                    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
                      {phase.deliverable}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Primary risk</p>
                    {primaryBlocker ? (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 ${
                              blockerSeverityTone[primaryBlocker.severity] ?? 'border border-slate-200 bg-white text-slate-600'
                            }`}
                          >
                            {severityLabel}
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-900">{primaryBlocker.issue}</p>
                      </div>
                    ) : (
                      <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                        No major blockers captured yet.
                      </div>
                    )}
                  </div>
                </div>

                {primaryBlocker ? (
                  <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mitigation</p>
                    <p className="mt-2 text-sm text-slate-700">{primaryBlocker.mitigation}</p>
                  </div>
                ) : null}

                {checklist.length ? (
                  <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Checklist</p>
                    <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-slate-700">
                      {checklist.map((item, index) => (
                        <li key={`${phase.id}-check-${index}`}>
                          {item}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      {onRequestReview ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => onRequestReview('reproducibility')}
              disabled={isSending || isComplete}
              className="inline-flex items-center justify-center rounded-lg border border-sky-200 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-sky-700 transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60"
            >
              {buttonLabel}
            </button>
            <div>
              <p className="text-sm text-slate-600">We&apos;ll compile patents, PhD theses, and contact the original study authors.</p>
              {communityReviewStatus === 'error' && communityReviewError ? (
                <p className="mt-2 text-xs text-rose-600">{communityReviewError}</p>
              ) : null}
              {isComplete ? (
                <p className="mt-2 text-xs text-slate-500">Thanks — we&apos;ll reach out via email to coordinate this review.</p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ClaimsReportPreview({
  report,
  onRequestReview,
  communityReviewStatus = 'idle',
  communityReviewRequested = false,
  communityReviewError = ''
}: {
  report: ResearchPaperAnalysis;
  onRequestReview?: (source: VerificationTrack) => void;
  communityReviewStatus?: 'idle' | 'sending' | 'success' | 'error';
  communityReviewRequested?: boolean;
  communityReviewError?: string;
}) {
  const headline = report.evidence.strong[0];
  const strongEvidence = report.evidence.strong;
  const gaps = report.evidence.gaps;
  const assumptions = report.evidence.assumptions;
  const isSending = communityReviewStatus === 'sending';
  const isComplete = communityReviewRequested || communityReviewStatus === 'success';
  const buttonLabel = isSending ? 'Sending…' : isComplete ? 'Request Received' : 'Request Community Review';

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Claims verification snapshot</h3>
            <p className="mt-1 text-sm text-slate-600">{report.paper.title}</p>
            <p className="text-xs text-slate-500">{report.paper.authors} • {report.paper.venue}</p>
          </div>
          <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-700">
            Claims
          </span>
        </div>
        {headline ? (
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Headline finding</h4>
            <p className="mt-2 text-sm font-semibold text-slate-900">{headline.claim}</p>
            <p className="mt-1 text-xs text-slate-500">Source: {headline.source}</p>
          </div>
        ) : null}
      </section>

      {strongEvidence.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Evidence we stand behind</h4>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            {strongEvidence.map((item, index) => (
              <li key={`claims-evidence-${index}`} className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-500" />
                <div>
                  <p className="font-medium text-slate-900">{item.claim}</p>
                  <p className="text-xs text-slate-500">Source: {item.source}</p>
                  {item.notes ? <p className="mt-1 text-xs text-slate-500">{item.notes}</p> : null}
                  {item.confidence ? <p className="mt-1 text-xs text-slate-400">Confidence: {item.confidence}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {gaps.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Gaps & follow-ups</h4>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            {gaps.map((gap, index) => (
              <li key={`claims-gap-${index}`} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <AlertTriangle className="mt-1 h-5 w-5 text-amber-500" />
                <div>
                  <p className="font-medium text-slate-900">{gap.description}</p>
                  <p className="text-xs text-slate-500">Impact: {gap.impact}</p>
                  <p className="text-xs text-slate-500">Severity: {gap.severity}</p>
                  {gap.needsExpert !== undefined ? (
                    <p className="mt-1 text-xs text-slate-400">
                      {gap.needsExpert ? 'Requires expert outreach.' : 'Track internally for now.'}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {assumptions.length ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Assumptions we made</h4>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
            {assumptions.map((assumption, index) => (
              <li key={`assumption-${index}`}>{assumption}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {onRequestReview ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => onRequestReview('claims')}
              disabled={isSending || isComplete}
              className="inline-flex items-center justify-center rounded-lg border border-sky-200 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-sky-700 transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60"
            >
              {buttonLabel}
            </button>
            <div>
              <p className="text-sm text-slate-600">We&apos;ll compile patents, PhD theses, and contact the original study authors.</p>
              {communityReviewStatus === 'error' && communityReviewError ? (
                <p className="mt-2 text-xs text-rose-600">{communityReviewError}</p>
              ) : null}
              {isComplete ? (
                <p className="mt-2 text-xs text-slate-500">Thanks — we&apos;ll reach out via email to coordinate this review.</p>
              ) : null}
            </div>
          </div>
    </section>
  ) : null}
</div>
);
}

export default function Home() {
  const { user, signOut } = useAuth();
  const authModal = useAuthModal();

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
  const [verificationView, setVerificationView] = useState<VerificationTrack>('reproducibility');
  const [feedPopulating, setFeedPopulating] = useState(false);
  const [verificationSummary, setVerificationSummary] = useState<VerificationSummaryPayload | null>(null);
  const [verificationSummaryLoading, setVerificationSummaryLoading] = useState(false);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [verificationRequestStatus, setVerificationRequestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [verificationRequestError, setVerificationRequestError] = useState('');
  const [activeVerificationRequestType, setActiveVerificationRequestType] = useState<VerificationRequestType | null>(null);
  const [communityReviewStatus, setCommunityReviewStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [communityReviewError, setCommunityReviewError] = useState('');

  const profileManualKeywordsRef = useRef('');
  const isMountedRef = useRef(true);
  const accountDropdownRef = useRef<HTMLDivElement | null>(null);
  const feedPollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const feedPollCountRef = useRef(0);
  const feedLastResultCountRef = useRef(0);
  const feedStableCountRef = useRef(0);
  const hasSetFirstPaperRef = useRef(false);
  const feedObservedChangeRef = useRef(false);
  const feedLastUpdatedRef = useRef<string | null>(null);
  const feedBaselineRecordedRef = useRef(false);
  const personalFeedInitializedRef = useRef(false);

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
    if (!user) {
      // Reset account dropdown when user logs out
      setAccountDropdownVisible(false);
    }
  }, [user]);

  // Removed getAuthHeaders - now inlined to avoid dependency issues

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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


  useEffect(() => {
    if (!user) {
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
      setSelectedPaper(null);
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

        // Update local state with the enriched profile
        setProfile((prev) => {
          if (!prev) {
            return {
              orcid_id: effectiveOrcid,
              academic_website: prev?.academic_website ?? null,
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
      } finally {
        setProfileEnrichmentLoading(false);
      }
    }, [
      authModal,
      profile?.orcid_id,
      profileEnrichmentLoading,
      profileManualKeywords,
      user,
    ]);

  const handleRefreshPersonalFeed = useCallback(async () => {
    const hasKeywords = profile?.profile_personalization?.manual_keywords?.length > 0;

    if (!hasKeywords) {
      // If no keywords, open profile editor
      setProfileEditorVisible(true);
      return;
    }

    // Clear current state
    setSelectedListId(null);
    setListItems([]);
    setYearQuery('');
    setKeywordQuery('');

    // Fetch from personal feed API
    setKeywordLoading(true);
    setKeywordError('');
    setLastKeywordQuery(PERSONAL_FEED_LABEL);
    setLastYearQuery(null);

    try {
      const response = await fetch('/api/personal-feed');

      if (!response.ok) {
        throw new Error(`Personal feed failed with status ${response.status}`);
      }

      const data = await response.json();
      const results = Array.isArray(data.results) ? data.results : [];

      setKeywordResults(results);

      if (results.length > 0) {
        setSelectedPaper(results[0]);
      } else {
        setKeywordError('No recent papers found in your personal feed. Papers are updated daily.');
      }
    } catch (error) {
      console.error('Personal feed error:', error);
      setKeywordError('Could not load your personal feed. Please try again.');
    } finally {
      setKeywordLoading(false);
    }
  }, [profile]);

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
      setProfileFormOrcid(formatOrcidId(profile.orcid_id ?? ''));
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
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="profile-orcid" className={PROFILE_LABEL_CLASSES}>
              ORCID ID <span className="text-xs font-normal text-slate-500">(keywords auto-generated)</span>
            </label>
          </div>
          <div className="flex gap-2">
            <input
              id="profile-orcid"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Enter ORCID ID (e.g., 0000-0002-1825-0097)"
              value={profileFormOrcid}
              onChange={(event) => setProfileFormOrcid(formatOrcidId(event.target.value))}
              className={`flex-1 ${PROFILE_INPUT_CLASSES}`}
            />
            <button
              type="button"
              onClick={handleOrcidSave}
              disabled={profileEnrichmentLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-sky-600 border border-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {profileEnrichmentLoading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
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
        {renderResultList(keywordResults, 'Search result')}
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
  const claimsReport = (verificationSummary?.claimsReport as ResearchPaperAnalysis | null) ?? null;
  const reproducibilityReport = (verificationSummary?.reproducibilityReport as ResearchPaperAnalysis | null) ?? null;
  const hasClaimsReport = Boolean(claimsReport);
  const hasReproReport = Boolean(reproducibilityReport);
  const shouldDisableVerification = !hasSelectedPaper || isVerificationSending || verificationSummaryLoading;

  const isTrackReportAvailable = (track: VerificationTrack) =>
    track === 'claims' ? hasClaimsReport : hasReproReport;

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
        claimsReport: sampleReport
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
        claimsReport: data.claimsReport ?? null
      });
    } catch (error) {
      console.error('Failed to load verification summary:', error);
      setVerificationSummary(null);
    } finally {
      setVerificationSummaryLoading(false);
    }
  }, [selectedPaperId]);

  const handleVerificationRequest = async (track: VerificationTrack) => {
    if (!selectedPaper) {
      return;
    }

    setVerificationView(track);

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
      setVerificationModalOpen(true);
      requestAnimationFrame(() => {
        document.getElementById('verification-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }

    if (isSamplePaper) {
      const sampleReport = VERIFICATION_DATA[selectedPaper.id] ?? null;
      const now = new Date().toISOString();
      setVerificationView(track);
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
            request_payload: null
          }
        ],
        communityReviewRequests: [],
        reproducibilityReport: sampleReport,
        claimsReport: sampleReport
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
    } catch (requestError) {
      console.error('Verification request failed:', requestError);
      setVerificationRequestError(
        requestError instanceof Error
          ? requestError.message
          : 'Unexpected error submitting verification request.'
      );
      setVerificationRequestStatus('error');
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

  const handleCommunityReviewRequest = async (source: VerificationTrack) => {
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

    setVerificationView('reproducibility');
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
    if (shouldDisableVerification) {
      return 'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 cursor-not-allowed opacity-60';
    }

    const classes = [DETAIL_REPRO_BUTTON_CLASSES];
    if (verificationView === track) {
      classes.push(DETAIL_VERIFY_BUTTON_ACTIVE_CLASSES);
    }
    return classes.join(' ');
  };

  const BASE_LABELS: Record<VerificationTrack, string> = {
    reproducibility: 'VERIFY REPRODUCIBILITY',
    claims: 'VERIFY CLAIMS'
  };

  const VIEW_LABELS: Record<VerificationTrack, string> = {
    reproducibility: 'VERIFIED REPRODUCIBILITY',
    claims: 'VERIFIED CLAIMS'
  };

  const getVerificationButtonLabel = (track: VerificationTrack): string => {
    if (isVerificationSending) {
      return 'Sending request…';
    }
    if (isTrackReportAvailable(track)) {
      return VIEW_LABELS[track];
    }
    return BASE_LABELS[track];
  };

  const getVerificationButtonTitle = (track: VerificationTrack): string => {
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
      return track === 'reproducibility'
        ? 'View the latest reproducibility briefing for this paper.'
        : 'View the latest claims briefing for this paper.';
    }
    if (hasActiveVerificationRequest) {
      return 'Our agent is already processing this paper — switch views to review progress.';
    }
    return track === 'reproducibility'
      ? 'Kick off the combined reproducibility + claims briefing.'
      : 'Kick off the combined claims + reproducibility briefing.';
  };

  const verificationButtons = (
    <div className="flex items-center gap-3 sm:gap-4">
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => handleVerificationRequest('reproducibility')}
          className={getVerificationButtonClasses('reproducibility')}
          aria-pressed={verificationView === 'reproducibility'}
          disabled={shouldDisableVerification}
          title={getVerificationButtonTitle('reproducibility')}
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
          onClick={() => handleVerificationRequest('claims')}
          className={getVerificationButtonClasses('claims')}
          aria-pressed={verificationView === 'claims'}
          disabled={shouldDisableVerification}
          title={getVerificationButtonTitle('claims')}
        >
          <span className="flex items-center gap-2">
            {getVerificationButtonLabel('claims')}
          </span>
        </button>
        <span
          className={`h-1 w-full rounded-full bg-gradient-to-r from-violet-400 via-sky-500 to-emerald-400 transition-all duration-200 ease-out ${verificationView === 'claims' ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
        />
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

  const handlePaperSaved = (listId?: number) => {
    const startTime = Date.now();
    console.log('📝 [PERF] handlePaperSaved started');

    // Invalidate list metadata cache to reflect updated item counts
    if (user) {

      const listCacheKey = `${LIST_METADATA_CACHE_KEY}-${user.id}`;
      clearCachedData(listCacheKey);

      // Invalidate specific list items cache if we know which list was updated
      if (listId) {
        const listItemsCacheKey = `${LIST_ITEMS_CACHE_KEY}-${user.id}-${listId}`;
        clearCachedData(listItemsCacheKey);

        // Also clear from memory cache
        setCachedListItems(prev => {
          const newCache = new Map(prev);
          newCache.delete(listId);
          return newCache;
        });
      }

      // Refresh list metadata to show updated counts
      console.log('📝 [PERF] Refreshing user lists after save');
      fetchUserLists(true);
    }

    console.log(`📝 [PERF] handlePaperSaved completed in ${Date.now() - startTime}ms`);
  };





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

      const { error } = await supabase
        .from('profiles')
        .update({
          orcid_id: normalizedOrcid,
          academic_website: normalizedWebsite || null,
          profile_personalization: simplePersonalization,
          last_profile_enriched_at: new Date().toISOString(),
          profile_enrichment_version: 'manual-v1',
        })
        .eq('id', user.id);

      if (error) {
        console.error('Profile update failed', error);
        setProfileSaveError('We could not save your research profile. Please try again.');
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

  const handleKeywordSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keywordQuery.trim();
    const trimmedYear = yearQuery.trim();
    const parsedYear = trimmedYear ? parseInt(trimmedYear, 10) : null;
    const validYear = parsedYear && parsedYear >= 1900 && parsedYear <= new Date().getFullYear() + 2 ? parsedYear : null;
    const atLeastOneFilter = researchChecked || patentsChecked;

    // Clear list selection when searching
    setSelectedListId(null);
    setListItems([]);

    if (!trimmed) {
      setKeywordError('Enter keywords to explore the literature feed.');
      setKeywordResults([]);
      setSelectedPaper(!user ? SAMPLE_PAPERS[0] : null); // Return to default for non-auth users
      setLastKeywordQuery('');
    setLastYearQuery(null);
      return;
    }

    if (!atLeastOneFilter) {
      setKeywordError('Select at least one source before searching.');
      setKeywordResults([]);
      setSelectedPaper(!user ? SAMPLE_PAPERS[0] : null); // Return to default for non-auth users
      setLastKeywordQuery('');
    setLastYearQuery(null);
      return;
    }

    const filterLabels: string[] = [];
    if (researchChecked) filterLabels.push('research');
    if (patentsChecked) filterLabels.push('patents');

    const queryWithFilters = filterLabels.length
      ? `${trimmed} ${filterLabels.join(' ')}`
      : trimmed;

    setKeywordLoading(true);
    setKeywordError('');
    setLastKeywordQuery(trimmed);
    setLastYearQuery(validYear);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: queryWithFilters, ...(validYear && { year: validYear }) }),
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
                  <div className="flex items-center justify-between w-full gap-4">
                    <div className="flex-shrink-0">
                      <span className="text-sm font-bold uppercase tracking-[0.2em] text-slate-600">Evidentia</span>
                    </div>
                    <div className="relative flex-shrink-0" ref={accountDropdownRef}>
                      <button
                        type="button"
                        onClick={handleAccountDropdownToggle}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
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
                    onClick={handleRefreshPersonalFeed}
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
                              className={`w-full flex items-center justify-between rounded-lg border p-3 text-sm transition ${
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
                              <span className={`text-xs ${isSelected ? 'text-sky-700' : 'text-slate-500'}`}>
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
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-sm font-bold uppercase tracking-[0.2em] text-slate-600">Evidentia</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={authModal.openLogin}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
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
                <div className="relative flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                    className="flex-1 bg-transparent px-5 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                  <div className="h-6 w-px bg-slate-200"></div>
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
                    className="w-20 bg-transparent px-3 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none text-center"
                  />
                  <button
                    type="submit"
                    className={`mr-2 inline-flex items-center rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-sky-400 ${keywordLoading ? 'cursor-not-allowed opacity-70' : ''}`}
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
                {user && hasKeywords && !isPersonalFeedActive && (keywordResults.length > 0 || lastKeywordQuery) && (
                  <button
                    onClick={handleRefreshPersonalFeed}
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
            className={`min-h-0 min-w-0 transition-all duration-300 ${DETAIL_SHELL_CLASSES} xl:basis-[38%] xl:h-full xl:overflow-y-auto xl:overflow-x-hidden xl:pl-2 xl:border-l xl:border-slate-200/70 2xl:basis-[40%]`}
          >
            {selectedPaper ? (
              <div className="flex flex-col gap-4">
                {/* Share Discovery */}
                <div className="sticky top-0 z-10 -mx-2 px-2 pt-2 pb-3 xl:-mx-6 xl:px-6 bg-slate-50/95 backdrop-blur">
                  <div className="relative flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm opacity-60">
                    <input
                      type="text"
                      disabled
                      placeholder="Share your wisdom to help science"
                      className="w-full bg-transparent px-5 py-3.5 text-sm text-slate-400 placeholder:text-slate-400 focus:outline-none cursor-not-allowed"
                    />
                    <button
                      type="button"
                      disabled
                      className="mr-2 inline-flex items-center rounded-xl bg-slate-400 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white cursor-not-allowed"
                    >
                      Share
                    </button>
                  </div>
                </div>

                <div className={`${DETAIL_HERO_CLASSES} flex flex-col gap-4`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
                  {metaSummary ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <p className="text-xs text-slate-600">{metaSummary}</p>
                      {verificationButtons}
                    </div>
                  ) : (
                    <div className="flex justify-end">
                      {verificationButtons}
                    </div>
                  )}
                </div>

              <section className="space-y-4">
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

                {/* DOI/External links for non-sample papers */}
                {!isSamplePaperId(selectedPaper.id) && selectedPaperPrimaryLink && (
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

                      const activeReport = verificationView === 'claims'
                        ? claimsReport ?? fallbackReport
                        : reproducibilityReport ?? fallbackReport;

                      if (activeReport) {
                        const communityReviewHandler = user
                          ? handleCommunityReviewRequest
                          : (_track: VerificationTrack) => {
                              authModal.openSignup();
                            };

                        return verificationView === 'claims' ? (
                          <ClaimsReportPreview
                            report={activeReport}
                            onRequestReview={communityReviewHandler}
                            communityReviewStatus={communityReviewStatus}
                            communityReviewRequested={hasCommunityReviewRequest}
                            communityReviewError={communityReviewError}
                          />
                        ) : (
                          <StaticReproReport
                            report={activeReport}
                            onRequestReview={communityReviewHandler}
                            communityReviewStatus={communityReviewStatus}
                            communityReviewRequested={hasCommunityReviewRequest}
                            communityReviewError={communityReviewError}
                          />
                        );
                      }

                      if (latestVerificationRequest) {
                        const status = latestVerificationRequest.status;
                        const statusLabel = status.replace('_', ' ');
                        let statusMessage = 'The request is recorded. We will follow up with the full briefing shortly.';
                        if (status === 'pending' || status === 'in_progress') {
                          statusMessage = 'Agent is searching this now. Expect the briefing after the next feed refresh.';
                        } else if (status === 'completed') {
                          statusMessage = 'The analysis is complete. The briefing will appear after the next feed refresh.';
                        } else if (status === 'cancelled') {
                          statusMessage = 'This request was cancelled. Re-run the briefing if you need a fresh analysis.';
                        }

                        return (
                          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-700">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">Verification briefing in progress</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Submitted {formatRelativeTime(latestVerificationRequest.created_at)} • Status: {statusLabel}
                                </p>
                              </div>
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                                {verificationView === 'claims' ? 'Claims view' : 'Reproducibility view'}
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
    </div>
  )
}
