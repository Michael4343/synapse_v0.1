'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import { LogOut, Rss, User, UserCog, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useAuthModal, getUserDisplayName } from '../lib/auth-hooks';
import { createClient } from '../lib/supabase';
import { AuthModal } from '../components/auth-modal';
import type { ProfilePersonalization } from '../lib/profile-types';
import { SaveToListModal } from '../components/save-to-list-modal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { VerifyReproducibilityPayload } from '../lib/reproducibility-report';
import {
  getCachedData,
  setCachedData,
  clearCachedData,
  PERSONAL_FEED_CACHE_KEY,
  PERSONAL_FEED_TTL_MS,
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

const AEST_OFFSET_MINUTES = 10 * 60
const AEST_OFFSET_MS = AEST_OFFSET_MINUTES * 60 * 1000

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

const SHELL_CLASSES = 'min-h-screen bg-slate-50 text-slate-900 flex flex-col xl:h-screen xl:overflow-hidden';
const FEED_CARD_CLASSES = 'flex h-full min-h-0 flex-col space-y-6 px-2 pt-4 pb-12 xl:px-6 xl:pb-16';
const DETAIL_SHELL_CLASSES = 'flex h-full min-h-0 flex-col space-y-6 px-2 pt-4 pb-12 xl:px-6 xl:pb-16';
const DETAIL_HERO_CLASSES = 'rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-4 shadow-inner';
const TILE_BASE_CLASSES = 'group relative flex cursor-pointer flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 transition duration-150 hover:border-slate-300 hover:bg-slate-50 max-h-[400px] overflow-y-auto';
const TILE_SELECTED_CLASSES = 'border-sky-400 bg-sky-50 ring-1 ring-sky-100';
const FEED_LOADING_WRAPPER_CLASSES = 'relative flex flex-col gap-3';
const FEED_SPINNER_CLASSES = 'inline-block h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent';
const FEED_LOADING_PILL_CLASSES = 'inline-flex items-center gap-2 self-start rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-600 shadow-sm';
const SEARCH_CONTAINER_CLASSES = 'relative flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm';
const SEARCH_INPUT_CLASSES = 'w-full bg-transparent px-5 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none';
const SEARCH_BUTTON_CLASSES = 'mr-2 inline-flex items-center rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-sky-400';
const FILTER_BAR_CLASSES = 'flex gap-2 pt-4 overflow-x-auto';
const FILTER_CHECKBOX_LABEL_CLASSES = 'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 whitespace-nowrap';
const FILTER_CHECKBOX_DISABLED_LABEL_CLASSES = 'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-2.5 py-2 text-xs font-medium text-slate-400 opacity-80 cursor-not-allowed whitespace-nowrap';
const FILTER_CHECKBOX_INPUT_CLASSES = 'h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500';
const FILTER_CHECKBOX_INPUT_DISABLED_CLASSES = 'text-slate-300 focus:ring-0';
const RESULT_SUMMARY_CLASSES = 'flex flex-wrap items-baseline gap-2 text-sm text-slate-600';
const DETAIL_METADATA_CLASSES = 'space-y-3 text-sm text-slate-600';
const DETAIL_LINK_CLASSES = 'text-lg font-semibold text-sky-600 underline decoration-sky-300 underline-offset-4 transition hover:text-sky-700';
const TILE_LINK_CLASSES = 'inline-flex items-center text-xs font-semibold text-sky-600 underline decoration-sky-300 underline-offset-4 transition hover:text-sky-700';
const SIDEBAR_CARD_CLASSES = 'flex flex-col gap-6 px-2 pt-4 pb-10 xl:px-4 xl:pt-6 xl:pb-12';
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

function filterByRecency(papers: ApiSearchResult[], days: number): ApiSearchResult[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return papers.filter(paper =>
    paper.publicationDate && new Date(paper.publicationDate) >= cutoff
  );
}

type VerificationStatus = 'verified' | 'inferred' | 'uncertain'
type GapSeverity = 'critical' | 'moderate' | 'minor'
type RiskLevel = 'Low' | 'Medium' | 'High'

interface MockFeasibilityQuestion {
  id: string
  question: string
  weight: number
  category: string
  helper?: string
}

interface MockBlocker {
  severity: GapSeverity
  issue: string
  mitigation: string
  verificationStatus: VerificationStatus
}

interface MockCriticalPhase {
  id: string
  phase: string
  duration: string
  cost: string
  riskLevel: RiskLevel
  dependencies: string[]
  requirements: string[]
  outputs: string[]
  blockers: MockBlocker[]
}

interface MockEvidenceItem {
  claim: string
  source: string
  verificationStatus: VerificationStatus
  notes?: string
}

interface MockGap {
  concern: string
  impact: string
  severity: GapSeverity
  resolvableWithExpertAnalysis: boolean
}

interface MockReproReport {
  stage: 'ai_research' | 'expert_verified'
  lastUpdated: string
  reviewers: string[]
  paper: {
    title: string
    authors: string
    venue: string
    doi: string
  }
  verdict: {
    grade: string
    confidence: string
    mainMessage: string
    successProbability: number
    timeToFirstResult: string
    totalCost: string
    skillCeiling: string
    confidenceLevel: 'ai_inferred' | 'expert_verified'
  }
  criticalPath: MockCriticalPhase[]
  evidenceBase: {
    strongEvidence: MockEvidenceItem[]
    gaps: MockGap[]
    assumptions: string[]
  }
  feasibilityQuestions: MockFeasibilityQuestion[]
  expertEnhancements: {
    authorContacted: boolean
    datasetsVerified: string[]
    protocolClarifications: string[]
    additionalResources: string[]
    turnaround: string
  }
}

const STAGE_META: Record<MockReproReport['stage'], { label: string; description: string; badgeClasses: string }> = {
  ai_research: {
    label: 'AI Deep Research',
    description: 'Automated synthesis from public sources',
    badgeClasses: 'bg-sky-100 text-sky-600 border border-sky-200'
  },
  expert_verified: {
    label: 'Expert-Verified Analysis',
    description: 'Humans validated sources, protocols, and access',
    badgeClasses: 'bg-emerald-100 text-emerald-700 border border-emerald-200'
  }
}

const RISK_BADGES: Record<RiskLevel, string> = {
  Low: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  Medium: 'border border-amber-200 bg-amber-50 text-amber-700',
  High: 'border border-red-200 bg-red-50 text-red-700'
}

const VERIFICATION_DATA: Record<string, MockReproReport> = {
  '68d962effe5520777791bd6ec8ffa4b963ba4f38': {
    stage: 'ai_research',
    lastUpdated: '2025-02-10',
    reviewers: ['AI Research Desk'],
    paper: {
      title: 'A Programmable Dual-RNA–Guided DNA Endonuclease in Adaptive Bacterial Immunity',
      authors: 'Jinek et al.',
      venue: 'Science 2012',
      doi: '10.1126/science.1225829'
    },
    verdict: {
      grade: 'A-',
      confidence: 'High',
      mainMessage: 'Highly reproducible for well-equipped molecular biology labs. Main challenge is capital investment and specialised expertise for multi-step Cas9 protein purification.',
      successProbability: 0.85,
      timeToFirstResult: '2-4 months',
      totalCost: '$6,000-$10,000 (or $500-$2,000 using commercial Cas9)',
      skillCeiling: 'Graduate-level molecular biologist with protein purification expertise',
      confidenceLevel: 'ai_inferred'
    },
    feasibilityQuestions: [
      {
        id: 'plasmids',
        question: 'Do you maintain human iPSC-derived neurons or comparable VCP disease models?',
        weight: 3,
        category: 'Model Systems',
        helper: 'Authors relied on patient-derived cortical neurons; organoids are acceptable with baseline QC.'
      },
      {
        id: 'imaging',
        question: 'Can you run high-content imaging or time-lapse microscopy for autophagy flux?',
        weight: 2,
        category: 'Instrumentation',
        helper: 'Needed to quantify LC3, SQSTM1, and aggregate clearance across dosing windows.'
      },
      {
        id: 'assays',
        question: 'Do you have validated autophagy and proteasome activity assays ready to deploy?',
        weight: 2,
        category: 'Assays',
        helper: 'Study used paired LC3-II westerns, proteasome-Glo readouts, and ubiquitin clearance panels.'
      },
      {
        id: 'compounds',
        question: 'Can you source or synthesise the VCP activator compound panel described?',
        weight: 2,
        category: 'Materials',
        helper: 'Lead molecules ship from two specialised vendors; analog synthesis support may be required.'
      },
      {
        id: 'compliance',
        question: 'Are your approvals for patient-derived cell handling current and traceable?',
        weight: 1,
        category: 'Operations',
        helper: 'Requires IRB amendments plus cold-chain documentation for neuron stocks.'
      }
    ],
    criticalPath: [
      {
        id: 'planning',
        phase: 'Compound sourcing and quality control',
        duration: '1 week',
        cost: '$4k',
        riskLevel: 'Medium',
        dependencies: [],
        requirements: ['Confirm vendor availability', 'Set up HPLC and mass spec QC workflow', 'Prepare storage and dosing stocks'],
        outputs: ['Validated compound panel', 'Stability and solubility profiles'],
        blockers: [
          {
            severity: 'moderate',
            issue: 'Lead compounds currently on allocation with 6 week replenishment lead time',
            mitigation: 'Engage alternate supplier identified in supplementary methods or pursue CRO synthesis slot.',
            verificationStatus: 'inferred'
          }
        ]
      },
      {
        id: 'models',
        phase: 'Neuronal model setup and characterisation',
        duration: '2-3 weeks',
        cost: '$12k',
        riskLevel: 'Medium',
        dependencies: ['planning'],
        requirements: ['Differentiate iPSC neurons or thaw VCP mutant lines', 'Benchmark baseline autophagy and proteasome markers'],
        outputs: ['QC validated neurons ready for dosing', 'Baseline proteostasis reference set'],
        blockers: [
          {
            severity: 'critical',
            issue: 'Differentiation batches show day-to-day variability that shifts proteostasis baseline',
            mitigation: 'Adopt author SOP for maturation days and include internal healthy control lines.',
            verificationStatus: 'inferred'
          },
          {
            severity: 'moderate',
            issue: 'Neurons require mycoplasma-negative confirmation before dosing window',
            mitigation: 'Schedule third-party sterility panel in advance; include kill step in SOP.',
            verificationStatus: 'inferred'
          }
        ]
      },
      {
        id: 'assays',
        phase: 'Autophagy and proteasome assays',
        duration: '10 days',
        cost: '$9k',
        riskLevel: 'High',
        dependencies: ['models'],
        requirements: ['High-content imaging pipeline configured', 'Proteasome activity kit validated with controls'],
        outputs: ['Flux curves across compound doses', 'Proteasome recovery metrics'],
        blockers: [
          {
            severity: 'moderate',
            issue: 'Compound cytotoxicity window is narrow beyond 48 hours',
            mitigation: 'Adopt staggered dosing schedule and include viability gating described in supplement.',
            verificationStatus: 'inferred'
          }
        ]
      },
      {
        id: 'analysis',
        phase: 'Data integration and reporting',
        duration: '1 week',
        cost: '$3k',
        riskLevel: 'Low',
        dependencies: ['assays'],
        requirements: ['Analysis scripts for proteostasis metrics', 'Predefined QC gates for outlier exclusion'],
        outputs: ['Integrated autophagy and proteasome report', 'Recommendations for in vivo follow-up'],
        blockers: [
          {
            severity: 'minor',
            issue: 'Normalisation requires internal controls not included in public data dump',
            mitigation: 'Recreate control curves using provided spreadsheets or request raw files via expert channel.',
            verificationStatus: 'inferred'
          }
        ]
      }
    ],
    evidenceBase: {
      strongEvidence: [
        {
          claim: 'VCP-874 compound boosted autophagic flux by 45 percent in patient-derived neurons.',
          source: 'Chen et al. Supplementary Figure 4',
          verificationStatus: 'verified'
        },
        {
          claim: 'Proteasome-Glo assays showed 1.6x activity recovery after 24 hour dosing.',
          source: 'Main text Figure 3C + methods section',
          verificationStatus: 'inferred',
          notes: 'Authors provide raw luminescence tables with positive control alignment.'
        },
        {
          claim: 'Co-treatment with NRF2 activator reduced aggregate burden without additional toxicity.',
          source: 'Appendix synergy screen',
          verificationStatus: 'inferred'
        }
      ],
      gaps: [
        {
          concern: 'Exact supplier formulation for lead compound not disclosed.',
          impact: 'Potency may drift if excipients differ.',
          severity: 'critical',
          resolvableWithExpertAnalysis: true
        },
        {
          concern: 'Long-term toxicity data limited to 48 hour window.',
          impact: 'Chronic dosing plans remain speculative.',
          severity: 'moderate',
          resolvableWithExpertAnalysis: true
        },
        {
          concern: 'Proteasome assay instrumentation details are high level.',
          impact: 'Labs may burn cycles troubleshooting calibration.',
          severity: 'minor',
          resolvableWithExpertAnalysis: false
        }
      ],
      assumptions: [
        'Lab can allocate uninterrupted incubator capacity for 3 week neuronal maturation.',
        'Reproduction focuses on in vitro clearance outcomes; in vivo validation is out of scope.'
      ]
    },
    expertEnhancements: {
      authorContacted: false,
      datasetsVerified: ['Vendor roster for VCP activators with batch QC sheets', 'Validated iPSC differentiation SOP with day-by-day milestones'],
      protocolClarifications: ['Autophagy imaging acquisition settings', 'Proteasome activity normalisation script'],
      additionalResources: ['Chemistry CRO intro for analog synthesis', 'Template for IRB amendment covering VCP neuron work'],
      turnaround: 'Delivered within 12 business days'
    }
  },
  abd1c342495432171beb7ca8fd9551ef13cbd0ff: {
    stage: 'ai_research',
    lastUpdated: '2025-02-05',
    reviewers: ['AI Research Desk'],
    paper: {
      title: 'ImageNet Classification with Deep Convolutional Neural Networks',
      authors: 'Krizhevsky et al.',
      venue: 'NeurIPS 2012',
      doi: '10.1145/3065386'
    },
    verdict: {
      grade: 'B+',
      confidence: 'Medium',
      mainMessage: 'Reproducing AlexNet is feasible with modern tooling, but matching reported accuracy still requires meticulous hyperparameter control and careful data preprocessing.',
      successProbability: 0.72,
      timeToFirstResult: '3-5 weeks',
      totalCost: '$12k-$18k (GPU time + engineering)',
      skillCeiling: 'Applied ML engineer with CUDA familiarity',
      confidenceLevel: 'ai_inferred'
    },
    feasibilityQuestions: [
      {
        id: 'gpu_fleet',
        question: 'Do you have access to at least two 24GB GPUs or equivalent cloud instances for distributed training?',
        weight: 3,
        category: 'Compute',
        helper: 'The original configuration used two GTX 580 cards; modern replications typically run on A6000 or H100 class hardware.'
      },
      {
        id: 'dataset_ops',
        question: 'Is your team comfortable managing the full ImageNet ingestion pipeline with deterministic preprocessing?',
        weight: 2,
        category: 'Data Engineering',
        helper: 'Consistent crop, flip, and colour jitter policies are required to reproduce the headline accuracy.'
      },
      {
        id: 'framework',
        question: 'Can you maintain a custom CUDA/CuDNN environment or leverage a framework that hides the legacy kernels?',
        weight: 2,
        category: 'Tooling',
        helper: 'Original code relies on bespoke kernels; contemporary PyTorch implementations close the gap but need precise cuDNN versions.'
      }
    ],
    criticalPath: [
      {
        id: 'data-prep',
        phase: 'Dataset normalisation and caching',
        duration: '1 week',
        cost: '$2k',
        riskLevel: 'Medium',
        dependencies: [],
        requirements: ['Curate ImageNet train/val split', 'Generate deterministic shuffles', 'Provision fast NVMe cache'],
        outputs: ['Verified TFRecords/LMDB shards', 'Augmentation checklist'],
        blockers: [
          {
            severity: 'moderate',
            issue: 'Checksum drift or missing images break reproducibility guarantees.',
            mitigation: 'Reconcile with ImageNet 2012 metadata archive and store manifest diffs.',
            verificationStatus: 'inferred'
          }
        ]
      },
      {
        id: 'training',
        phase: 'Baseline training run',
        duration: '10-14 days',
        cost: '$8k',
        riskLevel: 'High',
        dependencies: ['data-prep'],
        requirements: ['Two high-memory GPUs', 'Mixed precision friendly kernels', 'Robust checkpointing'],
        outputs: ['Top-1/Top-5 curves', 'Checkpoint artefacts'],
        blockers: [
          {
            severity: 'critical',
            issue: 'Learning rate schedule or weight decay misconfiguration collapses accuracy.',
            mitigation: 'Adopt original step schedule and monitor validation every 20k iterations.',
            verificationStatus: 'inferred'
          }
        ]
      },
      {
        id: 'benchmarking',
        phase: 'Evaluation and ablation runs',
        duration: '1-2 weeks',
        cost: '$4k',
        riskLevel: 'Medium',
        dependencies: ['training'],
        requirements: ['Automated evaluation scripts', 'Telemetry for throughput'],
        outputs: ['Reproduction metrics with confidence intervals', 'Throughput benchmarks'],
        blockers: [
          {
            severity: 'moderate',
            issue: 'Hardware variance makes throughput comparisons noisy.',
            mitigation: 'Report normalised images/sec and include A/B with reference implementation.',
            verificationStatus: 'inferred'
          }
        ]
      }
    ],
    evidenceBase: {
      strongEvidence: [
        {
          claim: 'Modern PyTorch reference implementations reach within 1% top-5 accuracy when original augmentation schedule is mirrored.',
          source: 'PyTorch hub AlexNet reproduction [GitHub](https://github.com/pytorch/vision)',
          verificationStatus: 'verified'
        },
        {
          claim: 'Deterministic data loaders improve convergence stability across seeds.',
          source: 'FastAI ImageNet replication notes [Fast.ai forums](https://forums.fast.ai)',
          verificationStatus: 'inferred'
        }
      ],
      gaps: [
        {
          concern: 'Exact random seed usage per GPU stream is undocumented.',
          impact: 'Accuracy can fluctuate by >1% without aligned seeds.',
          severity: 'moderate',
          resolvableWithExpertAnalysis: true
        },
        {
          concern: 'Legacy CUDA kernels referenced in the paper are not maintained.',
          impact: 'Teams must port to modern frameworks or backport drivers.',
          severity: 'critical',
          resolvableWithExpertAnalysis: true
        }
      ],
      assumptions: [
        'Reproduction targets FP32 parity before experimenting with mixed precision.',
        'Cloud spot interruptions are avoided by reserving dedicated GPU capacity.'
      ]
    },
    expertEnhancements: {
      authorContacted: false,
      datasetsVerified: ['ImageNet 2012 manifest with checksum report'],
      protocolClarifications: ['Learning rate and momentum schedule cross-check'],
      additionalResources: ['Script for deterministic PyTorch data loaders', 'GPU scheduling template for Slurm'],
      turnaround: 'Delivered within 9 business days'
    }
  },
  c92bd747a97eeafdb164985b0d044caa1dc6e73e: {
    stage: 'ai_research',
    lastUpdated: '2024-11-18',
    reviewers: ['Materials Repro Desk'],
    paper: {
      title: 'Electric Field Effect in Atomically Thin Carbon Films',
      authors: 'Novoselov et al.',
      venue: 'Science 2004',
      doi: '10.1126/science.1102896'
    },
    verdict: {
      grade: 'B',
      confidence: 'Medium',
      mainMessage: 'Graphene exfoliation and device fabrication remain craft-heavy; reproduced mobility numbers require disciplined cleanroom practice.',
      successProbability: 0.62,
      timeToFirstResult: '6-8 weeks',
      totalCost: '$25k-$40k (consumables + device processing)',
      skillCeiling: 'Cleanroom physicist with microfabrication portfolio',
      confidenceLevel: 'ai_inferred'
    },
    feasibilityQuestions: [
      {
        id: 'cleanroom',
        question: 'Do you have ISO-6 or better cleanroom access with electron-beam lithography?',
        weight: 3,
        category: 'Facilities',
        helper: 'High-mobility graphene devices need low-particle environments for contacts and gates.'
      },
      {
        id: 'metrology',
        question: 'Is Raman spectroscopy and AFM characterisation available in-house?',
        weight: 2,
        category: 'Instrumentation',
        helper: 'Layer verification and strain diagnostics depend on Raman signatures and thickness mapping.'
      },
      {
        id: 'substrate',
        question: 'Can you source high-quality Si/SiO₂ wafers with 300 nm oxide stack?',
        weight: 1,
        category: 'Materials',
        helper: 'Optical identification of flakes assumes this stack; alternative thicknesses complicate QC.'
      }
    ],
    criticalPath: [
      {
        id: 'exfoliation',
        phase: 'Graphene exfoliation and transfer',
        duration: '2 weeks',
        cost: '$6k',
        riskLevel: 'High',
        dependencies: [],
        requirements: ['Natural graphite source', 'Polymethyl methacrylate transfer pipeline', 'Optical inspection workflow'],
        outputs: ['Catalogue of mono- and bilayer flakes', 'Transfer yield report'],
        blockers: [
          {
            severity: 'critical',
            issue: 'Flake contamination or wrinkling degrades mobility.',
            mitigation: 'Adopt dry-transfer protocol and anneal under forming gas.',
            verificationStatus: 'inferred'
          }
        ]
      },
      {
        id: 'patterning',
        phase: 'Device lithography and metallisation',
        duration: '3 weeks',
        cost: '$12k',
        riskLevel: 'Medium',
        dependencies: ['exfoliation'],
        requirements: ['E-beam resist stack', 'Ti/Au evaporation', 'Lift-off controls'],
        outputs: ['Hall-bar devices', 'Contact resistance measurements'],
        blockers: [
          {
            severity: 'moderate',
            issue: 'Contact resistance variance masks intrinsic mobility.',
            mitigation: 'Perform four-probe calibration and anneal contacts at 200°C in forming gas.',
            verificationStatus: 'inferred'
          }
        ]
      },
      {
        id: 'measurement',
        phase: 'Electrical testing and analysis',
        duration: '1-2 weeks',
        cost: '$7k',
        riskLevel: 'Medium',
        dependencies: ['patterning'],
        requirements: ['Low-noise probe station', 'Gate bias sweeps', 'Carrier mobility extraction scripts'],
        outputs: ['Mobility curves', 'Charge neutrality point analysis'],
        blockers: [
          {
            severity: 'moderate',
            issue: 'Water adsorption shifts Dirac point over measurement window.',
            mitigation: 'Measure in vacuum and bake samples prior to testing.',
            verificationStatus: 'inferred'
          }
        ]
      }
    ],
    evidenceBase: {
      strongEvidence: [
        {
          claim: 'Multiple groups have matched room-temperature mobility ~10,000 cm²/Vs with improved transfer protocols.',
          source: 'Graphene replication survey [Nature Nanotechnology](https://www.nature.com/articles/nnano.2010.221)',
          verificationStatus: 'verified'
        },
        {
          claim: 'Dry-transfer techniques reduce polymer residue and raise yield.',
          source: 'Graphene dry transfer comparison [ACS Nano](https://pubs.acs.org/doi/10.1021/nn201207c)',
          verificationStatus: 'inferred'
        }
      ],
      gaps: [
        {
          concern: 'Original substrate cleaning recipe not fully specified.',
          impact: 'Residues alter device mobility and gating behaviour.',
          severity: 'moderate',
          resolvableWithExpertAnalysis: true
        },
        {
          concern: 'Long-term stability of devices under ambient exposure unreported.',
          impact: 'Field effect measurements drift after hours without encapsulation.',
          severity: 'minor',
          resolvableWithExpertAnalysis: false
        }
      ],
      assumptions: [
        'Hydrogen anneal capability is available for interface cleaning.',
        'Reproduction focuses on back-gated devices; top-gated variants are out of scope.'
      ]
    },
    expertEnhancements: {
      authorContacted: false,
      datasetsVerified: ['Transfer yield log template'],
      protocolClarifications: ['Annealing schedule confirmation'],
      additionalResources: ['Cleanroom traveller for graphene Hall bars'],
      turnaround: 'Delivered within 3 weeks'
    }
  },
  fc448a7db5a2fac242705bd8e37ae1fc4a858643: {
    stage: 'ai_research',
    lastUpdated: '2024-10-02',
    reviewers: ['Genomics Repro Desk'],
    paper: {
      title: 'Initial sequencing and analysis of the human genome.',
      authors: 'Lander et al.',
      venue: 'Nature 2001',
      doi: '10.1038/35057062'
    },
    verdict: {
      grade: 'C',
      confidence: 'Low',
      mainMessage: 'Reproducing the full Human Genome Project workflow is impractical; focus on targeted re-analyses with contemporary reference datasets.',
      successProbability: 0.32,
      timeToFirstResult: '3-6 months',
      totalCost: '$150k-$250k+',
      skillCeiling: 'Computational genomics lead + wet-lab sequencing core',
      confidenceLevel: 'ai_inferred'
    },
    feasibilityQuestions: [
      {
        id: 'sequencing-core',
        question: 'Do you operate or collaborate with a high-throughput sequencing core capable of whole-genome runs?',
        weight: 3,
        category: 'Infrastructure',
        helper: 'Replicating the full pipeline requires industrial-scale instruments; partial reproductions can leverage NovaSeq or PromethION systems.'
      },
      {
        id: 'storage',
        question: 'Can you store and process petabyte-scale intermediate datasets securely?',
        weight: 2,
        category: 'Data Management',
        helper: 'Assembly and variant calling workflows generate large temporary artefacts that must be retained for audit.'
      },
      {
        id: 'ethics',
        question: 'Are ethics approvals and data governance frameworks in place for human genomic data?',
        weight: 2,
        category: 'Governance',
        helper: 'Replication even with public datasets must comply with consent restrictions and jurisdictional privacy standards.'
      }
    ],
    criticalPath: [
      {
        id: 'scope',
        phase: 'Scope baseline and secure reference datasets',
        duration: '4 weeks',
        cost: '$15k',
        riskLevel: 'Medium',
        dependencies: [],
        requirements: ['Access to public HGP releases', 'Alignment on evaluation metrics', 'Compliance review'],
        outputs: ['Replication charter', 'Data governance checklist'],
        blockers: [
          {
            severity: 'moderate',
            issue: 'Data use agreements may restrict redistribution of derived artefacts.',
            mitigation: 'Engage institutional review and adopt controlled-access workflows.',
            verificationStatus: 'inferred'
          }
        ]
      },
      {
        id: 'assembly',
        phase: 'Computational assembly and annotation replay',
        duration: '8-12 weeks',
        cost: '$80k',
        riskLevel: 'High',
        dependencies: ['scope'],
        requirements: ['High-memory compute cluster', 'Assembly pipelines (SOAPdenovo/ALLPATHS-LG equivalent)', 'Annotation tooling'],
        outputs: ['Draft assemblies', 'Annotation comparison reports'],
        blockers: [
          {
            severity: 'critical',
            issue: 'Legacy pipeline components are unmaintained and require porting to modern environments.',
            mitigation: 'Use contemporary assemblers with documented parameter translation to original methods.',
            verificationStatus: 'inferred'
          }
        ]
      },
      {
        id: 'analysis',
        phase: 'Comparative analysis and validation',
        duration: '6-8 weeks',
        cost: '$60k',
        riskLevel: 'Medium',
        dependencies: ['assembly'],
        requirements: ['Variant analysis toolchain', 'Cross-reference with GRCh38', 'Statistical validation scripts'],
        outputs: ['Variant concordance tables', 'Functional annotation deltas'],
        blockers: [
          {
            severity: 'moderate',
            issue: 'Legacy reference builds complicate alignment and interpretation.',
            mitigation: 'Normalise outputs against modern references and document coordinate lifts.',
            verificationStatus: 'inferred'
          }
        ]
      }
    ],
    evidenceBase: {
      strongEvidence: [
        {
          claim: 'Public HGP assemblies and annotations are reproducible with current tooling when pipelines are translated carefully.',
          source: 'Genome assembly replication study [Genome Research](https://genome.cshlp.org/content/25/10/1546)',
          verificationStatus: 'inferred'
        }
      ],
      gaps: [
        {
          concern: 'Experimental wet-lab protocols from 2001 are obsolete.',
          impact: 'Full biological replication would require redesign using modern sequencing chemistry.',
          severity: 'critical',
          resolvableWithExpertAnalysis: true
        },
        {
          concern: 'Cost estimates assume access to institutional compute subsidies.',
          impact: 'Commercial cloud replication may exceed $400k.',
          severity: 'moderate',
          resolvableWithExpertAnalysis: false
        }
      ],
      assumptions: [
        'Replication focuses on computational replay with existing raw reads.',
        'Wet-lab validation is limited to targeted re-sequencing using modern instruments.'
      ]
    },
    expertEnhancements: {
      authorContacted: false,
      datasetsVerified: ['Ensembl/NCBI mirrored HGP releases'],
      protocolClarifications: ['Parameter translation guide for assembly pipelines'],
      additionalResources: ['Costing worksheet for hybrid cloud clusters'],
      turnaround: 'Delivered within 8 weeks'
    }
  }
}

const EXPERT_UPGRADE_NOTES = [
  'Secure compound supply details, batch QC, and alternate vendors.',
  'Review the authors autophagy and proteasome assay playbooks with annotated settings.',
  'Coordinate a live Q&A with the study team on dosing cadence and toxicity monitoring.'
]

function getFeasibilitySummary(score: number): string {
  if (score >= 80) {
    return 'Ready to execute'
  }
  if (score >= 55) {
    return 'Needs targeted support'
  }
  return 'High risk - secure collaborators'
}

function getFeasibilityTone(score: number): string {
  if (score >= 80) {
    return 'text-emerald-600'
  }
  if (score >= 55) {
    return 'text-amber-600'
  }
  return 'text-red-600'
}

function StaticReproReport({ report }: { report: MockReproReport }) {
  const questions = report.feasibilityQuestions

  const [answers, setAnswers] = useState<Record<string, 'yes' | 'no' | null>>(() => {
    const initial: Record<string, 'yes' | 'no' | null> = {}
    questions.forEach((question) => {
      initial[question.id] = null
    })
    return initial
  })

  const totalWeight = useMemo(() => questions.reduce((sum, question) => sum + question.weight, 0), [questions])
  const yesWeight = useMemo(
    () => questions.reduce((sum, question) => sum + (answers[question.id] === 'yes' ? question.weight : 0), 0),
    [answers, questions]
  )
  const answeredCount = useMemo(
    () => questions.reduce((sum, question) => sum + (answers[question.id] ? 1 : 0), 0),
    [answers, questions]
  )

  const feasibilityScore = totalWeight > 0 ? Math.round((yesWeight / totalWeight) * 100) : 0
  const feasibilitySummary = getFeasibilitySummary(feasibilityScore)
  const feasibilityTone = getFeasibilityTone(feasibilityScore)

  const stageMeta = STAGE_META[report.stage]
  const confidenceSource = report.verdict.confidenceLevel === 'ai_inferred' ? 'AI generated' : 'Expert verified'

  function handleAnswer(questionId: string, response: 'yes' | 'no') {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: prev[questionId] === response ? null : response
    }))
  }

  const isPlaceholder = questions.length === 0 && report.criticalPath.length === 0

  if (isPlaceholder) {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{report.verdict.mainMessage}</h3>
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
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{report.verdict.mainMessage}</h3>
          <p className="mt-1 text-sm text-slate-600">{stageMeta.description}</p>
          <p className="mt-1 text-xs text-slate-500">{confidenceSource}</p>
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
            <p className="text-xs text-slate-400">{answeredCount} of {questions.length} answered</p>
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
            const currentAnswer = answers[question.id]
            return (
              <div key={question.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{question.question}</p>
                  <p className="mt-1 text-xs text-slate-500">{question.category} | Weight {question.weight}</p>
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
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h4 className="text-base font-semibold text-slate-900">Critical path</h4>
        <p className="mt-1 text-sm text-slate-600">High-level phases with the main output and risk to watch.</p>
        <div className="mt-4 space-y-3">
          {report.criticalPath.map((phase) => {
            const primaryOutput = phase.outputs[0] ?? 'Output captured during expert review'
            const primaryBlocker = phase.blockers[0]
            const dependenciesText = phase.dependencies.length ? `Depends on: ${phase.dependencies.join(', ')}` : null
            return (
              <div key={phase.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{phase.phase}</p>
                    <p className="text-xs text-slate-500">{phase.duration} | {phase.cost}</p>
                    {dependenciesText ? <p className="text-xs text-slate-400">{dependenciesText}</p> : null}
                  </div>
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${RISK_BADGES[phase.riskLevel]}`}>
                    Risk {phase.riskLevel}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key output</p>
                    <p className="mt-1 text-sm text-slate-700">{primaryOutput}</p>
                  </div>
                  {primaryBlocker ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Watch out</p>
                      <p className="mt-1 text-sm text-slate-700">{primaryBlocker.issue}</p>
                      <p className="mt-1 text-xs text-slate-500">Mitigation: {primaryBlocker.mitigation}</p>
                      <p className="mt-1 text-xs text-slate-400">Confidence: {primaryBlocker.verificationStatus}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h4 className="text-base font-semibold text-slate-900">Need deeper support?</h4>
        <p className="mt-1 text-sm text-slate-600">We will reach out and connect you with a subject matter expert to help you reproduce this.</p>
        <div className="mt-4">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-sky-200 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-sky-700 transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50"
          >
            Request expert analysis
          </button>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500">
          {EXPERT_UPGRADE_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function StaticClaimsPreview({ report }: { report: MockReproReport }) {
  const topClaim = report.evidenceBase.strongEvidence[0]
  const topGap = report.evidenceBase.gaps[0]

  const isPlaceholder = report.evidenceBase.strongEvidence.length === 0 && report.evidenceBase.gaps.length === 0

  if (isPlaceholder) {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Claims Verification</h3>
            <p className="mt-1 text-sm text-slate-600">{report.paper.title}</p>
            <p className="text-xs text-slate-500">{report.paper.authors} | {report.paper.venue}</p>
          </div>
        </section>
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-sm font-medium text-amber-900">
            Detailed claims analysis coming soon
          </p>
          <p className="mt-2 text-xs text-amber-700">
            Strong evidence, gaps, and follow-up questions will be added for this paper.
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {topClaim ? (
          <dl className="grid gap-4 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Headline finding</dt>
              <dd className="mt-1 font-semibold text-slate-900">{topClaim.claim}</dd>
              <dd className="mt-1 text-xs text-slate-500">Source: {topClaim.source}</dd>
            </div>
            {topGap ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Primary open question</dt>
                <dd className="mt-1 font-semibold text-slate-900">{topGap.concern}</dd>
                <dd className="mt-1 text-xs text-slate-500">Impact: {topGap.impact}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h4 className="text-base font-semibold text-slate-900">Evidence we stand behind</h4>
        <p className="mt-1 text-sm text-slate-600">Claims with citations or data that held up under automated review.</p>
        <ul className="mt-4 space-y-3 text-sm text-slate-700">
          {report.evidenceBase.strongEvidence.map((item, idx) => (
            <li key={`evidence-${idx}`} className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-500" />
              <div>
                <p className="font-medium text-slate-900">{item.claim}</p>
                <p className="text-xs text-slate-500">Source: {item.source}</p>
                {item.notes ? <p className="mt-1 text-xs text-slate-500">{item.notes}</p> : null}
                <p className="mt-1 text-xs text-slate-400">Confidence: {item.verificationStatus}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h4 className="text-base font-semibold text-slate-900">Gaps and follow-ups</h4>
        <p className="mt-1 text-sm text-slate-600">Where uncertainty remains and what we would chase next.</p>
        <ul className="mt-4 space-y-3 text-sm text-slate-700">
          {report.evidenceBase.gaps.map((gap, idx) => (
            <li key={`gap-${idx}`} className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <AlertTriangle className="mt-1 h-5 w-5 text-amber-500" />
              <div>
                <p className="font-medium text-slate-900">{gap.concern}</p>
                <p className="text-xs text-slate-500">Impact: {gap.impact}</p>
                <p className="text-xs text-slate-500">Severity: {gap.severity}</p>
                <p className="mt-1 text-xs text-slate-400">{gap.resolvableWithExpertAnalysis ? 'Expert outreach planned.' : 'Track internally for now.'}</p>
              </div>
            </li>
          ))}
        </ul>
        {report.evidenceBase.assumptions.length ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assumptions we made</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-500">
              {report.evidenceBase.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  )
}

interface ReproReportState {
  loading: boolean
  error: string
  payload: VerifyReproducibilityPayload | null
}

function ReproducibilityReportPreview({ paperId }: { paperId: string }) {
  const staticReport = paperId ? VERIFICATION_DATA[paperId] : undefined
  const isLandingSample = Boolean(SAMPLE_PAPERS.find((paper) => paper.id === paperId))
  const [{ loading, error, payload }, setState] = useState<ReproReportState>({
    loading: true,
    error: '',
    payload: null
  })

  useEffect(() => {
    if (!paperId) {
      setState({ loading: false, error: '', payload: null })
      return
    }

    if (staticReport) {
      setState({ loading: false, error: '', payload: null })
      return
    }

    if (isLandingSample) {
      setState({ loading: false, error: '', payload: null })
      return
    }

    let cancelled = false
    setState({ loading: true, error: '', payload: null })

    fetch(`/api/papers/${paperId}/reproducibility`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }
        const data = await response.json()
        if (!cancelled) {
          setState({ loading: false, error: '', payload: data?.report ?? null })
        }
      })
      .catch((requestError: unknown) => {
        if (cancelled) {
          return
        }
        const message = requestError instanceof Error ? requestError.message : 'Unexpected error'
        setState({ loading: false, error: message, payload: null })
      })

    return () => {
      cancelled = true
    }
  }, [paperId, staticReport, isLandingSample])

  if (staticReport) {
    return <StaticReproReport report={staticReport} />
  }

  if (!paperId) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
        Select a paper to generate a reproducibility briefing.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-slate-200/80" />
            <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-slate-200/70" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        We could not generate the reproducibility summary. {error}
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-700">
        No reproducibility data is available for this paper yet.
      </div>
    )
  }

  const {
    summary,
    assessment,
    timeEstimate,
    costEstimate,
    skillLevel,
    feasibilityFactors,
    environment,
    hyperparameters,
    seeds,
    replicationEvidence,
    risks,
    gaps,
    reproductionPlan,
    sources,
    metadata
  } = payload

  const environmentSections = [
    { title: 'Artefacts', items: environment.artefacts },
    { title: 'Datasets', items: environment.datasets },
    { title: 'Code', items: environment.code },
    { title: 'Hardware', items: environment.hardware },
    { title: 'Tooling', items: environment.tooling }
  ].filter((section) => section.items.length > 0)

  const isFallback = metadata.status === 'fallback'

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Reproducibility assessment · {assessment}
            </span>
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none text-slate-900">
              {summary}
            </ReactMarkdown>
          </div>
          <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Time to reproduce</p>
              <p className="mt-1 font-semibold text-slate-900">{timeEstimate}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Estimated cost</p>
              <p className="mt-1 font-semibold text-slate-900">{costEstimate}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Skill level</p>
              <p className="mt-1 font-semibold text-slate-900">{skillLevel}</p>
            </div>
          </div>
        </div>
      </section>

      {isFallback ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-sm font-medium text-amber-900">
            Automated coverage is limited for this paper.
          </p>
          <p className="mt-1 text-xs text-amber-700">{metadata.notes}</p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h4 className="text-base font-semibold text-slate-900">Feasibility factors</h4>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {feasibilityFactors.map((factor, index) => (
            <li key={`factor-${index}`} className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-sky-500" />
              <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none text-slate-700">
                {factor}
              </ReactMarkdown>
            </li>
          ))}
        </ul>
      </section>

      {environmentSections.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h4 className="text-base font-semibold text-slate-900">Environment checklist</h4>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {environmentSections.map((section) => (
              <div key={section.title} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.title}</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {section.items.map((item, index) => (
                    <li key={`${section.title}-${index}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none text-slate-700">
                        {item}
                      </ReactMarkdown>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {hyperparameters.length || seeds.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="text-base font-semibold text-slate-900">Hyperparameters</h4>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {hyperparameters.map((entry, index) => (
                  <li key={`hyper-${index}`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none text-slate-700">
                      {entry}
                    </ReactMarkdown>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-base font-semibold text-slate-900">Control seeds</h4>
              <ul className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
                {seeds.map((seed, index) => (
                  <li key={`seed-${index}`} className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                    {seed}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {replicationEvidence.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h4 className="text-base font-semibold text-slate-900">Replication evidence</h4>
          <ul className="mt-3 space-y-3">
            {replicationEvidence.map((item, index) => (
              <li key={`evidence-${index}`} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-500" />
                <div className="space-y-2 text-sm text-slate-700">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none text-slate-700">
                    {item.description}
                  </ReactMarkdown>
                  <p className="text-xs text-slate-500">Confidence: {item.confidence}</p>
                  {item.sources.length ? (
                    <p className="text-xs text-slate-500">Sources: {item.sources.join(', ')}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {risks.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h4 className="text-base font-semibold text-slate-900">Risks to manage</h4>
          <ul className="mt-3 space-y-3">
            {risks.map((risk, index) => (
              <li key={`risk-${index}`} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <AlertTriangle className="mt-1 h-5 w-5 text-amber-500" />
                <div className="space-y-2 text-sm text-slate-700">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none text-slate-700">
                    {risk.description}
                  </ReactMarkdown>
                  <p className="text-xs text-slate-500">Severity: {risk.severity}</p>
                  {risk.sources.length ? (
                    <p className="text-xs text-slate-500">Sources: {risk.sources.join(', ')}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {gaps.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h4 className="text-base font-semibold text-slate-900">Information gaps</h4>
          <ul className="mt-3 space-y-3">
            {gaps.map((gap, index) => (
              <li key={`gap-${index}`} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <AlertTriangle className="mt-1 h-5 w-5 text-red-500" />
                <div className="space-y-2 text-sm text-slate-700">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none text-slate-700">
                    {gap.description}
                  </ReactMarkdown>
                  <p className="text-xs text-slate-500">Impact: {gap.impact}</p>
                  <p className="text-xs text-slate-500">Severity: {gap.severity}</p>
                  {gap.sources.length ? (
                    <p className="text-xs text-slate-500">Sources: {gap.sources.join(', ')}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h4 className="text-base font-semibold text-slate-900">Minimal reproduction plan</h4>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          {reproductionPlan.map((step, index) => (
            <li key={`step-${index}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none text-slate-700">
                {step}
              </ReactMarkdown>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h4 className="text-base font-semibold text-slate-900">Sources</h4>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {sources.map((source, index) => {
            const isLink = typeof source.url === 'string' && source.url.toLowerCase().startsWith('http')
            return (
              <li key={`source-${index}`}>
                {isLink ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-600 underline decoration-sky-400 decoration-2 underline-offset-2"
                  >
                    {source.label}
                  </a>
                ) : (
                  <span className="text-slate-600">{source.label}</span>
                )}
              </li>
            )
          })}
        </ul>
        <p className="mt-4 text-xs text-slate-400">
          Query executed in {metadata.durationMs} ms · Citations collected: {metadata.citationCount}
        </p>
      </section>
    </div>
  )
}

function ClaimsVerificationPlaceholder() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Claims verification is coming soon</h3>
        <p className="mt-2 text-sm text-slate-600">
          We are reusing the reproducibility research pipeline to surface claim-level evidence. This button will activate once the claim grader is ready.
        </p>
      </section>
      <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 shadow-sm text-sm text-slate-600">
        VERIFY CLAIMS remains disabled so we can ship the reproducibility flow first.
      </section>
    </div>
  )
}

interface UserProfile {
  orcid_id: string | null
  academic_website: string | null
  profile_personalization: ProfilePersonalization | null
  last_profile_enriched_at: string | null
  profile_enrichment_version: string | null
  email_digest_enabled: boolean
  last_digest_sent_at: string | null
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

function formatOrcidId(input: string): string {
  // Remove all non-digit and non-X characters
  const clean = input.replace(/[^0-9X]/gi, '').toUpperCase()

  // Only format if we have digits to work with
  if (clean.length === 0) return ''

  // Add dashes every 4 characters, max 16 characters
  const limited = clean.slice(0, 16)
  return limited.replace(/(.{4})/g, '$1-').replace(/-$/, '')
}

function normalizeOrcidId(input: string): string {
  // Remove all dashes and spaces, keep only digits and X
  return input.replace(/[^0-9X]/gi, '').toUpperCase()
}

function validateOrcidId(input: string): { isValid: boolean; message?: string } {
  const normalized = normalizeOrcidId(input)

  if (normalized.length === 0) {
    return { isValid: false, message: 'ORCID ID is required' }
  }

  if (normalized.length < 16) {
    return { isValid: false, message: 'ORCID ID must be 16 characters long' }
  }

  if (normalized.length > 16) {
    return { isValid: false, message: 'ORCID ID is too long' }
  }

  // Check format: 15 digits followed by digit or X
  const pattern = /^[0-9]{15}[0-9X]$/
  if (!pattern.test(normalized)) {
    return { isValid: false, message: 'ORCID ID must contain 16 digits, with optional X as last character' }
  }

  return { isValid: true }
}

function createKeywordClusters(input: string) {
  // Split by newlines to get individual clusters
  const lines = input.split(/\n/).map((line) => line.trim()).filter((line) => line.length > 0)

  return lines.map((line, index) => {
    // Split by commas within each line to get keywords for this cluster
    const keywords = line.split(/,/).map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0)

    return {
      id: `manual-${Date.now()}-${index}`, // Generate unique ID
      label: keywords[0] || `Cluster ${index + 1}`, // Use first keyword as label
      priority: index + 1, // Order by appearance
      keywords: keywords,
      synonyms: [],
      methods: [],
      applications: [],
      source: 'manual' as const // Mark as manually created
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
  const [yearQuery, setYearQuery] = useState('');
  const [researchChecked, setResearchChecked] = useState(true);
  const [grantsChecked, setGrantsChecked] = useState(false);
  const [patentsChecked, setPatentsChecked] = useState(false);
  const [newsChecked, setNewsChecked] = useState(false);
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
  const [emailDigestEnabled, setEmailDigestEnabled] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [paperToSave, setPaperToSave] = useState<ApiSearchResult | null>(null);
  const [userLists, setUserLists] = useState<UserListSummary[]>([]);
  const [listsLoading, setListsLoading] = useState(false);

  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [listItems, setListItems] = useState<ApiSearchResult[]>([]);
  const [listItemsLoading, setListItemsLoading] = useState(false);
  const [listItemsLoadingMessage, setListItemsLoadingMessage] = useState('');
  const [cachedListItems, setCachedListItems] = useState<Map<number, ApiSearchResult[]>>(new Map());
  const [personalFeedResults, setPersonalFeedResults] = useState<ApiSearchResult[]>([]);
  const [personalFeedLoading, setPersonalFeedLoading] = useState(false);
  const [personalFeedError, setPersonalFeedError] = useState('');
  const [personalFeedLastUpdated, setPersonalFeedLastUpdated] = useState<string | null>(null);
  const [profileEditorVisible, setProfileEditorVisible] = useState(false);
  const [profileSaveLoading, setProfileSaveLoading] = useState(false);
  const [accountDropdownVisible, setAccountDropdownVisible] = useState(false);
  const [scrapedContent, setScrapedContent] = useState<string | null>(null);
  const [scrapedContentLoading, setScrapedContentLoading] = useState(false);
  const [scrapedContentError, setScrapedContentError] = useState('');
  const [scrapedContentIsStructured, setScrapedContentIsStructured] = useState(false);
  const [verificationMode, setVerificationMode] = useState<'repro' | 'claims' | null>(null);

  const profileManualKeywordsRef = useRef('');
  const isMountedRef = useRef(true);
  const accountDropdownRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    setVerificationMode(null);
  }, [selectedPaper?.id]);

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
        .select('orcid_id, academic_website, profile_personalization, last_profile_enriched_at, profile_enrichment_version, email_digest_enabled, last_digest_sent_at')
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
          email_digest_enabled: data?.email_digest_enabled ?? false,
          last_digest_sent_at: data?.last_digest_sent_at ?? null,
        });
        setEmailDigestEnabled(data?.email_digest_enabled ?? false);
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


  const loadPersonalFeed = useCallback(
    async (force = false, keywordsOverride?: string[]) => {
      if (!user) {
        return;
      }

      const manualKeywordsArray = keywordsOverride || profile?.profile_personalization?.manual_keywords || [];
      if (manualKeywordsArray.length === 0) {
        setPersonalFeedResults([]);
        setPersonalFeedError('Add keywords to your profile to generate your personal feed.');
        return;
      }

      const cacheKey = `${PERSONAL_FEED_CACHE_KEY}-${user.id}-${JSON.stringify(manualKeywordsArray)}`;
      const cached = getCachedData<{ results: ApiSearchResult[]; lastUpdated: string }>(cacheKey, PERSONAL_FEED_TTL_MS) || null;

      if (cached) {
        setPersonalFeedResults(cached.results);
        setPersonalFeedError('');
        setPersonalFeedLastUpdated(cached.lastUpdated);
      }

      const lastKnownUpdateIso = cached?.lastUpdated ?? personalFeedLastUpdated ?? null;
      const shouldRunSearch = force || !lastKnownUpdateIso || shouldRunScheduledPersonalFeed(lastKnownUpdateIso);

      if (!shouldRunSearch) {
        return;
      }

      if (personalFeedLoading) {
        return;
      }

      const keywords = manualKeywordsArray.slice(0, 4);

      setPersonalFeedLoading(true);
      setPersonalFeedError('');

      try {
        const allResults: ApiSearchResult[] = [];
        const seenIds = new Set<string>();

        for (let i = 0; i < keywords.length; i++) {
          const keyword = keywords[i];

          try {
            const currentYear = new Date().getFullYear();
            const response = await fetch('/api/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: keyword, year: currentYear })
            });

            let results: ApiSearchResult[] = [];
            if (response.ok) {
              const data = await response.json();
              results = Array.isArray(data.results) ? data.results : [];
            }

            if (results.length < 3) {
              try {
                const previousYear = currentYear - 1;
                const fallbackResponse = await fetch('/api/search', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ query: keyword, year: previousYear })
                });

                if (fallbackResponse.ok) {
                  const fallbackData = await fallbackResponse.json();
                  const fallbackResults = Array.isArray(fallbackData.results) ? fallbackData.results : [];
                  results = [...results, ...fallbackResults];
                }
              } catch (fallbackError) {
                console.log(`Previous year fallback failed for keyword "${keyword}":`, fallbackError);
              }
            }

            let filteredResults = filterByRecency(results, 7);
            if (filteredResults.length < 3) {
              filteredResults = filterByRecency(results, 14);
            }
            if (filteredResults.length < 3) {
              filteredResults = filterByRecency(results, 30);
            }
            if (filteredResults.length < 3) {
              filteredResults = results;
            }

            for (const result of filteredResults) {
              if (!seenIds.has(result.id) && allResults.length < 12) {
                allResults.push(result);
                seenIds.add(result.id);
              }
            }

            if (allResults.length > 0) {
              const sorted = [...allResults].sort((a, b) => {
                if (!a.publicationDate && !b.publicationDate) return 0;
                if (!a.publicationDate) return 1;
                if (!b.publicationDate) return -1;
                return new Date(b.publicationDate).getTime() - new Date(a.publicationDate).getTime();
              });
              setPersonalFeedResults(sorted);
              setPersonalFeedError('');
            }
          } catch (error) {
            console.warn(`Query ${i + 1} failed:`, error);
          }
        }

        if (allResults.length === 0) {
          setPersonalFeedError('No papers found for your keywords. Try different or broader terms.');
        } else {
          const sorted = allResults.sort((a, b) => {
            if (!a.publicationDate && !b.publicationDate) return 0;
            if (!a.publicationDate) return 1;
            if (!b.publicationDate) return -1;
            return new Date(b.publicationDate).getTime() - new Date(a.publicationDate).getTime();
          });

          const lastUpdated = new Date().toISOString();
          setPersonalFeedResults(sorted);
          setPersonalFeedLastUpdated(lastUpdated);

          setCachedData(cacheKey, { results: sorted, lastUpdated });
        }
      } catch (error) {
        console.error('Personal feed error:', error);
        setPersonalFeedError('Failed to load personal feed. Please try again.');
      } finally {
        setPersonalFeedLoading(false);
      }
    },
    [
      user,
      profile?.profile_personalization?.manual_keywords,
      personalFeedLoading,
      personalFeedLastUpdated,
    ]
  );

  useEffect(() => {
    if (!user) {
      setPersonalFeedResults([]);
      setPersonalFeedError('');
      setPersonalFeedLastUpdated(null);
      return;
    }

    // Wait for profile to load before attempting personal feed
    if (profileLoading) {
      return;
    }

    // Only auto-load personal feed once per user, after profile is loaded
    if (personalFeedResults.length === 0) {
      if (profile?.profile_personalization?.manual_keywords?.length > 0) {
        console.log('Auto-loading personal feed after profile loaded');
        loadPersonalFeed();
      } else {
        // Show helpful message for users without keywords
        setPersonalFeedError('Add keywords to your profile to generate your personal feed.');
        console.log('Profile loaded but no keywords found - prompting user to add keywords');
      }
    }
  }, [user, profileLoading, profile?.profile_personalization?.manual_keywords, personalFeedResults.length, loadPersonalFeed]);

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
              email_digest_enabled: false,
              last_digest_sent_at: null,
            };
          }

          return {
            ...prev,
            profile_personalization: result.personalization,
            last_profile_enriched_at: result.last_profile_enriched_at,
            profile_enrichment_version: result.profile_enrichment_version,
          };
        });

        // Reload the personal feed
        await loadPersonalFeed(true);

      } catch (error) {
        console.error('Profile enrichment request failed', error);
        setProfileEnrichmentError(error instanceof Error ? error.message : 'We could not refresh your personalization. Please try again.');
      } finally {
        setProfileEnrichmentLoading(false);
      }
    }, [
      authModal,
      loadPersonalFeed,
      profileEnrichmentLoading,
      profileManualKeywords,
      user,
    ]);

  useEffect(() => {
    if (profile) {
      setProfileFormOrcid(formatOrcidId(profile.orcid_id ?? ''));
      setProfileFormWebsite(profile.academic_website ?? '');
      setEmailDigestEnabled(profile.email_digest_enabled ?? false);
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
      setEmailDigestEnabled(false);
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
  const isSearchContext = keywordLoading || keywordResults.length > 0 || Boolean(lastKeywordQuery) || Boolean(keywordError);
  const isListViewActive = Boolean(selectedListId);
  const shouldShowPersonalFeed = Boolean(user && hasKeywords && !profileNeedsSetup && !isSearchContext && !isListViewActive);
  const personalizationInputs = (includeAction: boolean) => {
    const keywordsId = includeAction ? 'profile-keywords-editor' : 'profile-keywords';
    const resumeId = includeAction ? 'profile-resume-editor' : 'profile-resume';

    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <label htmlFor={keywordsId} className={PROFILE_LABEL_CLASSES}>
            Focus keywords <span className="text-xs font-normal text-slate-500">(separate with commas, e.g. &quot;AI, machine learning, neural networks&quot;)</span>
          </label>
          <textarea
            id={keywordsId}
            rows={4}
            value={profileManualKeywords}
            onChange={(event) => setProfileManualKeywords(event.target.value)}
            placeholder="machine learning, neural networks, computer vision, AI, deep learning"
            className={PROFILE_INPUT_CLASSES}
          />
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={emailDigestEnabled}
              onChange={(e) => setEmailDigestEnabled(e.target.checked)}
              className="w-4 h-4 text-sky-600 border-slate-300 rounded focus:ring-sky-500 focus:ring-2 cursor-pointer"
            />
            <span className="text-sm font-medium text-slate-700">
              Send me daily research updates
            </span>
          </label>
          {profile?.last_digest_sent_at && (
            <p className="text-xs text-slate-500 ml-7">
              Last sent: {formatRelativeTime(profile.last_digest_sent_at)}
            </p>
          )}
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
            <label htmlFor="profile-website" className={PROFILE_LABEL_CLASSES}>
              Academic website <span className="text-xs font-normal text-slate-500">(keywords auto-generated)</span>
            </label>
          </div>
          <div className="flex gap-2">
            <input
              id="profile-website"
              type="text"
              placeholder="Enter your academic website URL"
              value={profileFormWebsite}
              onChange={(event) => setProfileFormWebsite(event.target.value)}
              className={`flex-1 ${PROFILE_INPUT_CLASSES}`}
            />
            <button
              type="button"
              onClick={handleWebsiteSave}
              disabled={websiteScrapingLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-sky-600 border border-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {websiteScrapingLoading ? 'Saving…' : 'Save'}
            </button>
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
          {lastYearQuery && (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
              {lastYearQuery}
            </span>
          )}
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
    if ((personalFeedLoading || profileSaveLoading) && personalFeedResults.length === 0) {
      // Show loading state only if we have no results yet
      mainFeedContent = (
        <div className={FEED_LOADING_WRAPPER_CLASSES}>
          <span className={FEED_LOADING_PILL_CLASSES}>
            <span className={FEED_SPINNER_CLASSES} aria-hidden="true" />
            <span>Loading your personal feed…</span>
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
      // Show loading indicator at top if reloading with existing results
      const feedContent = renderResultList(personalFeedResults, 'Personal recommendation (recent)');
      if (personalFeedLoading || profileSaveLoading) {
        mainFeedContent = (
          <div className={FEED_LOADING_WRAPPER_CLASSES}>
            <span className={FEED_LOADING_PILL_CLASSES}>
              <span className={FEED_SPINNER_CLASSES} aria-hidden="true" />
              <span>Updating your personal feed…</span>
            </span>
            {feedContent}
          </div>
        );
      } else {
        mainFeedContent = feedContent;
      }
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

  const isLandingSampleSelected = selectedPaper ? SAMPLE_PAPERS.some((paper) => paper.id === selectedPaper.id) : false;

  const handleVerificationModeChange = (mode: 'repro' | 'claims') => {
    const requiresAuthentication = mode === 'repro' && !user && !isLandingSampleSelected;
    if (requiresAuthentication) {
      authModal.openSignup();
      return;
    }

    setVerificationMode(mode);
    requestAnimationFrame(() => {
      document.getElementById('verification-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const getVerificationButtonClasses = (mode: 'repro' | 'claims', isDisabled: boolean) => {
    const classes = [DETAIL_REPRO_BUTTON_CLASSES];
    if (isDisabled) {
      return 'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 cursor-not-allowed opacity-60';
    }
    if (verificationMode === mode) {
      classes.push(DETAIL_VERIFY_BUTTON_ACTIVE_CLASSES);
    }
    return classes.join(' ');
  };
  const hasSelectedPaper = Boolean(selectedPaper);
  const hasStaticVerification = selectedPaper ? Boolean(VERIFICATION_DATA[selectedPaper.id]) : false;
  const isClaimsActionEnabled = false;

  useEffect(() => {
    if (!isClaimsActionEnabled && verificationMode === 'claims') {
      setVerificationMode(null);
    }
  }, [isClaimsActionEnabled, verificationMode]);

  const verificationButtons = (
    <div className="flex items-center gap-3 sm:gap-4">
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => handleVerificationModeChange('repro')}
          className={getVerificationButtonClasses('repro', !hasSelectedPaper)}
          aria-pressed={verificationMode === 'repro'}
          disabled={!hasSelectedPaper}
          title={!hasSelectedPaper ? 'Select a paper to generate the reproducibility briefing.' : ''}
        >
          <span className="flex items-center gap-2">
            Verify reproducibility
          </span>
        </button>
        <span
          className={`h-1 w-full rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-sky-600 transition-all duration-200 ease-out ${verificationMode === 'repro' ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
        />
      </div>
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => handleVerificationModeChange('claims')}
          className={getVerificationButtonClasses('claims', !isClaimsActionEnabled)}
          aria-pressed={verificationMode === 'claims'}
          disabled={!isClaimsActionEnabled}
          title={isClaimsActionEnabled ? '' : 'Claims verification will unlock once automated grading is ready.'}
        >
          <span className="flex items-center gap-2">
            Verify claims
          </span>
        </button>
        <span
          className={`h-1 w-full rounded-full bg-gradient-to-r from-violet-400 via-sky-500 to-emerald-400 transition-all duration-200 ease-out ${verificationMode === 'claims' ? 'opacity-100 scale-100' : 'opacity-40 scale-90'}`}
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

        setProfileManualKeywords(allKeywords.join(', '));
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

        setProfileManualKeywords(allKeywords.join(', '));
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

    // Check if anything actually changed before setting loading states
    const keywordsChanged = JSON.stringify(profile?.profile_personalization?.manual_keywords || []) !== JSON.stringify(parsedManualKeywords);
    const orcidChanged = (profile?.orcid_id || null) !== normalizedOrcid;
    const websiteChanged = (profile?.academic_website || null) !== (normalizedWebsite || null);
    const digestChanged = (profile?.email_digest_enabled || false) !== emailDigestEnabled;
    const hasChanges = keywordsChanged || orcidChanged || websiteChanged || digestChanged;

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
          email_digest_enabled: emailDigestEnabled,
        })
        .eq('id', user.id);

      if (error) {
        console.error('Profile update failed', error);
        setProfileSaveError('We could not save your research profile. Please try again.');
        return;
      }

      setProfile((previous) => ({
        orcid_id: normalizedOrcid,
        academic_website: normalizedWebsite || null,
        profile_personalization: simplePersonalization,
        last_profile_enriched_at: new Date().toISOString(),
        profile_enrichment_version: 'manual-v1',
        email_digest_enabled: emailDigestEnabled,
        last_digest_sent_at: previous?.last_digest_sent_at ?? null,
      }));

      // Reset editing modes
      setOrcidEditingMode(false);
      setWebsiteEditingMode(false);

      // Close the profile editor modal on successful save
      closeProfileEditor();

      // Only reload the personal feed if there were actual changes
      if (hasChanges) {
        try {
          await loadPersonalFeed(true, parsedManualKeywords);
        } catch (error) {
          console.error('Failed to reload personal feed after profile save', error);
        }
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
    const atLeastOneFilter = researchChecked || grantsChecked || patentsChecked;

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
    if (grantsChecked) filterLabels.push('funding');
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

  const handleRefreshPersonalFeed = useCallback(() => {
    setKeywordQuery('');
    setYearQuery('');
    setKeywordResults([]);
    setKeywordError('');
    setLastKeywordQuery('');
    setLastYearQuery(null);
    setSelectedListId(null);
    setListItems([]);
    loadPersonalFeed();
  }, [loadPersonalFeed]);


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
    setProfileEditorVisible(false);
  }, []);

  return (
    <div className={SHELL_CLASSES}>
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-6 xl:px-8 min-h-0">
        <div className="relative flex flex-1 flex-col gap-6 xl:flex-row xl:gap-8 min-h-0 xl:overflow-hidden">
          <aside
            className="relative flex min-h-0 flex-col transition-all duration-300 ease-in-out xl:basis-[22%] xl:max-w-[22%] xl:h-full xl:overflow-y-auto xl:pr-4 xl:border-r xl:border-slate-200/70"
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
                        ? 'border-sky-400 bg-sky-100 shadow-sm'
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

              <form onSubmit={handleKeywordSearch} className="relative">
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
            className={`min-h-0 min-w-0 transition-all duration-300 ${DETAIL_SHELL_CLASSES} xl:basis-[38%] xl:h-full xl:overflow-y-auto xl:pl-4 xl:border-l xl:border-slate-200/70 2xl:basis-[40%]`}
          >
            {selectedPaper ? (
              <div className="flex h-full flex-col gap-4">
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

                <div id="verification-panel" className="space-y-4">
                  {hasSelectedPaper ? (
                    verificationMode === 'repro' ? (
                      <ReproducibilityReportPreview paperId={selectedPaper.id} />
                    ) : verificationMode === 'claims' ? (
                      hasStaticVerification ? (
                        <StaticClaimsPreview report={VERIFICATION_DATA[selectedPaper.id]} />
                      ) : (
                        <ClaimsVerificationPlaceholder />
                      )
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
                        Choose a verification track above to load the briefing.
                      </div>
                    )
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

                {/* DOI/External links for non-sample papers */}
                {!selectedPaper.id.startsWith('sample-') && selectedPaperPrimaryLink && (
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
