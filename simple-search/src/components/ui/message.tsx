'use client'

import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'

interface MessageProps {
  children: React.ReactNode
  variant?: 'success' | 'error' | 'warning' | 'info'
  className?: string
}

const MESSAGE_VARIANTS = {
  success: {
    container: 'rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm',
    icon: CheckCircle,
    iconColor: 'text-green-600',
    textColor: 'text-green-800'
  },
  error: {
    container: 'rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm',
    icon: XCircle,
    iconColor: 'text-red-600',
    textColor: 'text-red-800'
  },
  warning: {
    container: 'rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm',
    icon: AlertCircle,
    iconColor: 'text-amber-600',
    textColor: 'text-amber-800'
  },
  info: {
    container: 'rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm',
    icon: AlertCircle,
    iconColor: 'text-blue-600',
    textColor: 'text-blue-800'
  }
}

export function Message({ children, variant = 'info', className = '' }: MessageProps) {
  const config = MESSAGE_VARIANTS[variant]
  const IconComponent = config.icon

  return (
    <div className={`${config.container} ${className}`}>
      <div className="flex items-start gap-3">
        <IconComponent className={`h-4 w-4 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
        <div className={config.textColor}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function SuccessMessage({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <Message variant="success" className={className}>{children}</Message>
}

export function ErrorMessage({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <Message variant="error" className={className}>{children}</Message>
}

export function LoadingSpinner({ size = 'sm', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  }

  return (
    <Loader2 className={`animate-spin ${sizeClasses[size]} ${className}`} />
  )
}