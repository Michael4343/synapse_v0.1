'use client'

import React from 'react'
import { X, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react'

interface TutorialStep {
  id: number
  title: string
  description: string
  highlightSelector?: string
  action?: 'show-paper' | 'show-reproducibility' | 'show-claims' | 'cta'
  position?: 'center' | 'top' | 'bottom' | 'left' | 'right'
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 0,
    title: 'Welcome to Evidentia!',
    description: "We've loaded the breakthrough CRISPR Cas9 paper to show you what Evidentia can do for YOUR research.",
    highlightSelector: '[data-tutorial="paper-title"]',
    position: 'center'
  },
  {
    id: 1,
    title: 'View Full Research Papers',
    description: 'View full research papers with AI-structured sections. This is a preview - sign up to verify your own papers!',
    highlightSelector: '[data-tutorial="show-paper-button"]',
    action: 'show-paper',
    position: 'bottom'
  },
  {
    id: 2,
    title: 'Verify Reproducibility',
    description: 'See if research can be replicated in your lab - with feasibility scores, critical paths, and risk analysis.',
    highlightSelector: '[data-tutorial="reproducibility-button"]',
    action: 'show-reproducibility',
    position: 'bottom'
  },
  {
    id: 3,
    title: 'Reproducibility Deep Dive',
    description: 'Real verification reports analyze equipment needs, expertise gaps, and reproducibility risks for any paper.',
    highlightSelector: '[data-tutorial="verification-content"]',
    position: 'top'
  },
  {
    id: 4,
    title: 'Verify Scientific Claims',
    description: 'Verify scientific claims with confidence scores and evidence mapping to separate fact from hype.',
    highlightSelector: '[data-tutorial="claims-button"]',
    action: 'show-claims',
    position: 'bottom'
  },
  {
    id: 5,
    title: 'Ready to verify your own papers?',
    description: '',
    action: 'cta',
    position: 'center'
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

  const step = TUTORIAL_STEPS[currentStep]

  // Update highlighted element when step changes
  React.useEffect(() => {
    if (!isOpen || !step.highlightSelector) {
      setHighlightElement(null)
      return
    }

    const element = document.querySelector(step.highlightSelector) as HTMLElement
    setHighlightElement(element)

    // Scroll element into view
    if (element) {
      setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [currentStep, isOpen, step.highlightSelector])

  // Trigger action callbacks
  React.useEffect(() => {
    if (!isOpen) return

    if (onStepChange && step.action) {
      onStepChange(currentStep)
    }
  }, [currentStep, isOpen, step.action, onStepChange])

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

  // Calculate spotlight position
  const getSpotlightStyle = (): React.CSSProperties => {
    if (!highlightElement) return {}

    const rect = highlightElement.getBoundingClientRect()
    const padding = 12

    return {
      position: 'fixed',
      top: `${rect.top - padding}px`,
      left: `${rect.left - padding}px`,
      width: `${rect.width + padding * 2}px`,
      height: `${rect.height + padding * 2}px`,
      borderRadius: '12px',
      boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.75)',
      pointerEvents: 'none',
      zIndex: 60,
      transition: 'all 0.3s ease-out'
    }
  }

  // Calculate tooltip position
  const getTooltipStyle = (): React.CSSProperties => {
    if (!highlightElement || !step.position || step.position === 'center') {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      }
    }

    const rect = highlightElement.getBoundingClientRect()
    const tooltipWidth = 400
    const tooltipHeight = 200
    const gap = 20

    switch (step.position) {
      case 'bottom':
        return {
          position: 'fixed',
          top: `${rect.bottom + gap}px`,
          left: `${rect.left + rect.width / 2}px`,
          transform: 'translateX(-50%)'
        }
      case 'top':
        return {
          position: 'fixed',
          bottom: `${window.innerHeight - rect.top + gap}px`,
          left: `${rect.left + rect.width / 2}px`,
          transform: 'translateX(-50%)'
        }
      case 'left':
        return {
          position: 'fixed',
          top: `${rect.top + rect.height / 2}px`,
          right: `${window.innerWidth - rect.left + gap}px`,
          transform: 'translateY(-50%)'
        }
      case 'right':
        return {
          position: 'fixed',
          top: `${rect.top + rect.height / 2}px`,
          left: `${rect.right + gap}px`,
          transform: 'translateY(-50%)'
        }
      default:
        return {
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)'
        }
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm transition-opacity" />

      {/* Spotlight */}
      {highlightElement && (
        <div style={getSpotlightStyle()} />
      )}

      {/* Skip button - always visible in top right */}
      <button
        onClick={handleSkip}
        className="fixed top-4 right-4 z-[70] flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-lg transition hover:bg-slate-50"
      >
        <X className="h-4 w-4" />
        Skip Tutorial
      </button>

      {/* Tutorial Card */}
      <div
        style={getTooltipStyle()}
        className="z-[65] w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-300"
      >
        {step.action === 'cta' ? (
          // Final CTA Step
          <div className="p-8 text-center">
            <div className="mb-6 flex justify-center">
              <div className="rounded-full bg-sky-100 p-4">
                <CheckCircle2 className="h-8 w-8 text-sky-600" />
              </div>
            </div>
            <h2 className="mb-3 text-2xl font-bold text-slate-900">
              {step.title}
            </h2>
            <div className="mb-6 space-y-2 text-left">
              <p className="flex items-start gap-2 text-sm text-slate-600">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-500" />
                <span>Request verification for any research paper</span>
              </p>
              <p className="flex items-start gap-2 text-sm text-slate-600">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-500" />
                <span>Save papers to custom lists</span>
              </p>
              <p className="flex items-start gap-2 text-sm text-slate-600">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-500" />
                <span>Get personalized research feeds</span>
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleSignUp}
                className="flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-sky-400"
              >
                Sign Up Now
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={handleMaybeLater}
                className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
              >
                Maybe Later
              </button>
            </div>
          </div>
        ) : (
          // Regular Tutorial Steps
          <>
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-700">
                  Demo Preview
                </span>
                <span className="text-xs font-medium text-slate-500">
                  {currentStep + 1} / {TUTORIAL_STEPS.length}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm leading-relaxed text-slate-700">
                {step.description}
              </p>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              <button
                onClick={handleBack}
                disabled={currentStep === 0}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={handleNext}
                className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-400"
              >
                {currentStep === TUTORIAL_STEPS.length - 1 ? 'Finish' : 'Next'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
