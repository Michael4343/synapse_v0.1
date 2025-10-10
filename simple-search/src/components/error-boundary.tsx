'use client'

import React, { Component, ReactNode } from 'react'
import { usePostHog } from '../providers/PostHogProvider'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

class ErrorBoundaryClass extends Component<
  ErrorBoundaryProps & { posthog: any },
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps & { posthog: any }) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    })

    // Send error to PostHog
    if (this.props.posthog) {
      try {
        this.props.posthog.capture('react_error_boundary', {
          error_name: error.name,
          error_message: error.message,
          error_stack: error.stack,
          component_stack: errorInfo.componentStack,
          page_path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        })
      } catch (e) {
        console.error('Failed to send error to PostHog:', e)
      }
    }

    // Also log to console for development
    console.error('React Error Boundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI or default
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '2rem',
            backgroundColor: '#f8fafc',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: '600px',
              padding: '2rem',
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: '600',
                color: '#1e293b',
                marginBottom: '1rem',
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                fontSize: '1rem',
                color: '#64748b',
                marginBottom: '1.5rem',
                lineHeight: '1.6',
              }}
            >
              We&apos;ve encountered an unexpected error. Our team has been notified and will look into it.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details
                style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  backgroundColor: '#fee2e2',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    fontWeight: '500',
                    color: '#991b1b',
                    marginBottom: '0.5rem',
                  }}
                >
                  Error Details (Development Only)
                </summary>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: '#7f1d1d',
                    marginTop: '0.5rem',
                  }}
                >
                  {this.state.error.toString()}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null })
                window.location.reload()
              }}
              style={{
                marginTop: '1.5rem',
                padding: '0.75rem 1.5rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#2563eb'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#3b82f6'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * ErrorBoundary component that catches React rendering errors
 * and reports them to PostHog for monitoring.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <YourApp />
 * </ErrorBoundary>
 * ```
 *
 * With custom fallback:
 * ```tsx
 * <ErrorBoundary fallback={<CustomErrorPage />}>
 *   <YourApp />
 * </ErrorBoundary>
 * ```
 */
export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  const { posthog } = usePostHog()

  return (
    <ErrorBoundaryClass posthog={posthog} fallback={fallback}>
      {children}
    </ErrorBoundaryClass>
  )
}
