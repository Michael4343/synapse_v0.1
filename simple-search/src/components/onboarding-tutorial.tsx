'use client'

import React from 'react'
import { X, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react'

interface TutorialStep {
  id: number
  title: string
  description: string
  highlightSelector?: string
  action?: 'show-paper' | 'show-reproducibility' | 'show-claims' | 'cta'
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 0,
    title: 'Welcome to Evidentia!',
    description: "This is the breakthrough CRISPR Cas9 paper. Let's explore what Evidentia can do for your research.",
    highlightSelector: '[data-tutorial="paper-title"]'
  },
  {
    id: 1,
    title: 'View Full Research Papers',
    description: 'Click to view the full research paper with AI-structured sections.',
    highlightSelector: '[data-tutorial="show-paper-button"]',
    action: 'show-paper'
  },
  {
    id: 2,
    title: 'Verify Reproducibility',
    description: 'See if this research can be replicated in your lab with feasibility analysis.',
    highlightSelector: '[data-tutorial="reproducibility-button"]',
    action: 'show-reproducibility'
  },
  {
    id: 3,
    title: 'Reproducibility Analysis',
    description: 'Feasibility questions, critical paths, and evidence gaps - everything you need to assess reproducibility.',
    highlightSelector: '[data-tutorial="verification-content"]'
  },
  {
    id: 4,
    title: 'Verify Scientific Claims',
    description: 'Verify scientific claims with confidence scores and evidence mapping.',
    highlightSelector: '[data-tutorial="claims-button"]',
    action: 'show-claims'
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
    const padding = 16

    return {
      position: 'fixed',
      top: `${rect.top - padding}px`,
      left: `${rect.left - padding}px`,
      width: `${rect.width + padding * 2}px`,
      height: `${rect.height + padding * 2}px`,
      borderRadius: '16px',
      boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.85)',
      pointerEvents: 'none',
      zIndex: 60,
      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
    }
  }

  // Smart tooltip positioning - prefers side placement
  const getTooltipStyle = (): React.CSSProperties => {
    // CTA step always centered
    if (step.action === 'cta') {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: '400px',
        width: '90%'
      }
    }

    if (!highlightElement) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: '320px',
        width: '90%'
      }
    }

    const rect = highlightElement.getBoundingClientRect()
    const tooltipWidth = 320
    const gap = 24
    const padding = 16

    // Check available space on all sides
    const spaceRight = window.innerWidth - rect.right
    const spaceLeft = rect.left
    const spaceBottom = window.innerHeight - rect.bottom
    const spaceTop = rect.top

    // Prefer right side if there's enough space
    if (spaceRight > tooltipWidth + gap + padding) {
      return {
        position: 'fixed',
        top: `${rect.top + rect.height / 2}px`,
        left: `${rect.right + gap}px`,
        transform: 'translateY(-50%)',
        maxWidth: `${tooltipWidth}px`,
        width: '90%'
      }
    }

    // Try left side
    if (spaceLeft > tooltipWidth + gap + padding) {
      return {
        position: 'fixed',
        top: `${rect.top + rect.height / 2}px`,
        right: `${window.innerWidth - rect.left + gap}px`,
        transform: 'translateY(-50%)',
        maxWidth: `${tooltipWidth}px`,
        width: '90%'
      }
    }

    // Try bottom
    if (spaceBottom > 200) {
      return {
        position: 'fixed',
        top: `${rect.bottom + gap}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: 'translateX(-50%)',
        maxWidth: `${tooltipWidth}px`,
        width: '90%'
      }
    }

    // Try top
    if (spaceTop > 200) {
      return {
        position: 'fixed',
        bottom: `${window.innerHeight - rect.top + gap}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: 'translateX(-50%)',
        maxWidth: `${tooltipWidth}px`,
        width: '90%'
      }
    }

    // Fallback to bottom-right corner
    return {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      maxWidth: `${tooltipWidth}px`,
      width: '90%'
    }
  }

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

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm transition-opacity pointer-events-auto" />

      {/* Spotlight */}
      {highlightElement && (
        <div style={getSpotlightStyle()} />
      )}

      {/* Skip button - always visible in top right */}
      <button
        onClick={handleSkip}
        className="fixed top-4 right-4 z-[70] flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-lg transition hover:bg-slate-50 pointer-events-auto"
      >
        <X className="h-3.5 w-3.5" />
        Skip
      </button>

      {/* Tutorial Card */}
      <div
        style={getTooltipStyle()}
        className="z-[65] rounded-xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 pointer-events-auto"
      >
        {step.action === 'cta' ? (
          // Final CTA Step
          <div className="p-6 text-center">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-sky-100 p-3">
                <CheckCircle2 className="h-6 w-6 text-sky-600" />
              </div>
            </div>
            <h2 className="mb-2 text-xl font-bold text-slate-900">
              {step.title}
            </h2>
            <p className="mb-4 text-sm text-slate-600">
              Sign up free to unlock the full platform
            </p>
            <div className="mb-5 space-y-2 text-left">
              <div className="flex items-start gap-2 text-sm text-slate-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-500" />
                <span>Request verification for any research paper</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-slate-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-500" />
                <span>Save papers to custom lists</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-slate-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-500" />
                <span>Get personalized research feeds</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSignUp}
                className="flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-400"
              >
                Sign Up Now
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={handleMaybeLater}
                className="text-xs font-medium text-slate-500 transition hover:text-slate-700"
              >
                Maybe Later
              </button>
            </div>
          </div>
        ) : (
          // Regular Tutorial Steps - Smaller, less intrusive
          <>
            <div className="px-4 py-3 border-b border-slate-200">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-base font-semibold text-slate-900 leading-tight">{step.title}</h3>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 flex-shrink-0">
                  Demo
                </span>
              </div>
              <p className="text-sm leading-relaxed text-slate-600">
                {step.description}
              </p>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={handleBack}
                disabled={currentStep === 0}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              {renderProgressDots()}
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-400"
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
