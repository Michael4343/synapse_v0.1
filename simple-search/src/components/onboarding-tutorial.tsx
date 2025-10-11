'use client'

import React from 'react'
import { X, ArrowRight, ArrowLeft } from 'lucide-react'

interface TutorialStep {
  id: number
  title: string
  description: string
  highlightSelector?: string
  action?: 'show-paper' | 'show-reproducibility' | 'cta'
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 0,
    title: 'PAPER',
    description: 'Check the Paper Details tile for fast context, then scan the abstract right underneath.',
    highlightSelector: '[data-tutorial="paper-hero"]'
  },
  {
    id: 1,
    title: 'CAN I REPRODUCE THIS?',
    description: 'Tap the briefing to see straight answers on feasibility and lab readiness.',
    highlightSelector: '[data-tutorial="reproducibility-button"]',
    action: 'show-reproducibility'
  },
  {
    id: 2,
    title: 'FEASIBILITY SNAPSHOT',
    description: 'Walk the briefing for the quick summary and any blockers to watch.',
    highlightSelector: '[data-tutorial="repro-overview"]'
  },
  {
    id: 3,
    title: 'SIMILAR PAPERS',
    description: 'Jump up to the Similar Papers tab to surface adjacent literature clusters.',
    highlightSelector: '[data-tutorial="similar-papers-button"]'
  },
  {
    id: 4,
    title: 'SIMILAR PAPER INSIGHTS',
    description: 'Browse adjacent work to spot follow-up experiments and method variations.',
    highlightSelector: '[data-tutorial="similar-papers-panel"]'
  },
  {
    id: 5,
    title: 'Ready to verify your own papers?',
    description: '',
    action: 'cta'
  }
]

interface OnboardingTutorialProps {
  isOpen: boolean
  onClose: () => void
  onSignUp: () => void
  onStepChange?: (step: number) => void
}

export function OnboardingTutorial({ isOpen, onClose, onSignUp, onStepChange }: OnboardingTutorialProps) {
  const [currentStep, setCurrentStep] = React.useState(0)
  const [highlightElement, setHighlightElement] = React.useState<HTMLElement | null>(null)
  const previousHighlightRef = React.useRef<HTMLElement | null>(null)
  const guidancePanelRef = React.useRef<HTMLDivElement | null>(null)

  const step = TUTORIAL_STEPS[currentStep]
  const isFirstStep = step.id === 0

  // Lock page scroll when the tutorial is active so mobile users don't fight the viewport
  React.useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return

    const originalOverflow = document.body.style.overflow
    const originalPadding = document.body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
      document.body.style.paddingRight = originalPadding
    }
  }, [isOpen])

  // Update highlighted element when step changes
  React.useEffect(() => {
    if (!isOpen || !step.highlightSelector) {
      setHighlightElement(null)
      return
    }

    const element = document.querySelector(step.highlightSelector) as HTMLElement | null
    setHighlightElement(element)
  }, [currentStep, isOpen, step.highlightSelector])

  // Apply visual treatment to highlighted element
  React.useEffect(() => {
    if (!isOpen) {
      const previous = previousHighlightRef.current
      if (previous) {
        previous.classList.remove('tutorial-highlight-ring')
        previousHighlightRef.current = null
      }
      return
    }

    const previous = previousHighlightRef.current

    if (previous && previous !== highlightElement) {
      previous.classList.remove('tutorial-highlight-ring')
    }

    if (highlightElement) {
      highlightElement.classList.add('tutorial-highlight-ring')
      previousHighlightRef.current = highlightElement
    } else if (previous) {
      previous.classList.remove('tutorial-highlight-ring')
      previousHighlightRef.current = null
    }

    return () => {
      if (highlightElement) {
        highlightElement.classList.remove('tutorial-highlight-ring')
      }
    }
  }, [highlightElement, isOpen])

  // Keep highlighted section in view on mobile by nudging the page scroll
  React.useEffect(() => {
    if (!isOpen || !highlightElement || typeof window === 'undefined') return

    const ensureVisibility = () => {
      if (window.innerWidth >= 640) {
        highlightElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
        return
      }

      const rect = highlightElement.getBoundingClientRect()
      const panelTop = guidancePanelRef.current?.getBoundingClientRect().top ?? window.innerHeight
      const bottomGuard = Math.max(window.innerHeight - panelTop + 16, 120)
      const topGuard = 96
      const currentScrollY = window.scrollY

      if (rect.top < topGuard) {
        window.scrollTo({ top: Math.max(currentScrollY + rect.top - topGuard, 0), behavior: 'smooth' })
        return
      }

      if (rect.bottom > window.innerHeight - bottomGuard) {
        window.scrollTo({
          top: Math.max(currentScrollY + rect.bottom - (window.innerHeight - bottomGuard), 0),
          behavior: 'smooth'
        })
      }
    }

    const timeout = window.setTimeout(ensureVisibility, 140)

    return () => window.clearTimeout(timeout)
  }, [highlightElement, isOpen])

  // Notify parent when the step changes so it can sync the UI state
  React.useEffect(() => {
    if (!isOpen || !onStepChange) return

    onStepChange(currentStep)
  }, [currentStep, isOpen, onStepChange])

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSkip = () => {
    localStorage.setItem('evidentia_tutorial_completed', 'true')
    onClose()
  }

  const handleSignUp = () => {
    localStorage.setItem('evidentia_tutorial_completed', 'true')
    onSignUp()
    onClose()
  }

  const handleMaybeLater = () => {
    localStorage.setItem('evidentia_tutorial_completed', 'true')
    onClose()
  }

  if (!isOpen) return null

  // Progress dots
  const renderProgressDots = () => {
    return (
      <div className="flex items-center justify-center gap-1.5">
        {TUTORIAL_STEPS.map((_, index) => (
          <div
            key={index}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              index === currentStep
                ? 'w-6 bg-sky-500'
                : index < currentStep
                ? 'w-1.5 bg-sky-300'
                : 'w-1.5 bg-slate-300'
            }`}
          />
        ))}
      </div>
    )
  }

  const isFinalStep = currentStep === TUTORIAL_STEPS.length - 1
  const primaryActionLabel = isFinalStep ? 'Close tour' : currentStep === 0 ? 'Next' : 'Next'
  const primaryActionHandler = isFinalStep ? handleMaybeLater : handleNext

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {/* Skip button */}
      <button
        onClick={handleSkip}
        className="pointer-events-auto fixed right-4 z-[60] flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/95 px-4 py-1.5 text-xs font-medium text-slate-600 shadow-lg shadow-slate-900/15 transition hover:bg-white sm:right-6"
        style={{ top: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
      >
        <X className="h-3.5 w-3.5" />
        Skip tour
      </button>

      {/* Guidance panel */}
      <div
        className="pointer-events-auto fixed inset-x-0 bottom-0 z-[55] flex justify-center px-3 sm:bottom-8 sm:px-4"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div
          ref={guidancePanelRef}
          className={`w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_16px_40px_rgba(15,23,42,0.22)] backdrop-blur sm:max-w-xl sm:rounded-3xl ${isFirstStep ? 'translate-y-0' : ''}`}
        >
          <div className="border-b border-slate-100 bg-slate-900/90 px-5 py-3.5 text-center text-white sm:px-6 sm:py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-sky-300/90 sm:text-[11px]">Welcome to Evidentia</p>
            <h2 className="mt-1 text-lg font-semibold sm:mt-2 sm:text-xl">Personalised literature in minutes</h2>
          </div>
          <div className="px-5 py-4 text-center sm:px-6 sm:py-5">
            <h3 className="text-sm font-semibold text-slate-900 sm:text-base">{step.title}</h3>
            {step.description ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {step.description}
              </p>
            ) : null}
            {step.action === 'cta' && (
              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={handleSignUp}
                  className="flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-400"
                >
                  Sign up now
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={handleMaybeLater}
                  className="text-xs font-medium text-slate-500 transition hover:text-slate-700"
                >
                  Maybe later
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/90 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <button
              onClick={handleBack}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-white sm:justify-start ${isFirstStep ? 'invisible pointer-events-none' : ''}`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <div className="flex justify-center sm:order-none">
              {renderProgressDots()}
            </div>
            <button
              onClick={primaryActionHandler}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-400"
            >
              {primaryActionLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
