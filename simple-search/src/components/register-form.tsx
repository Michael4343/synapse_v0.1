'use client'

import { useAuthForm } from '../lib/auth-hooks'

interface RegisterFormProps {
  onSuccess?: () => void
}

const FORM_CLASSES = 'space-y-4'
const INPUT_GROUP_CLASSES = 'space-y-2'
const LABEL_CLASSES = 'block text-sm font-semibold text-slate-700'
const INPUT_CLASSES = 'w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100'
const PRIMARY_BUTTON_CLASSES = 'w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(56,189,248,0.2)] transition hover:-translate-y-0.5 hover:bg-sky-400 disabled:translate-y-0 disabled:bg-slate-300 disabled:shadow-none'
const GOOGLE_BUTTON_CLASSES = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:bg-slate-50 disabled:text-slate-400'
const DIVIDER_CLASSES = 'relative flex items-center justify-center'
const DIVIDER_LINE_CLASSES = 'absolute inset-x-0 h-px bg-slate-200'
const DIVIDER_TEXT_CLASSES = 'relative bg-white px-4 text-xs font-semibold text-slate-500'
const ERROR_CLASSES = 'rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600'
const TERMS_CLASSES = 'text-xs text-slate-500'
const SECTION_HEADER_CLASSES = 'text-sm font-semibold text-slate-700 border-t border-slate-200 pt-3 mt-3'
const SECTION_SUBTITLE_CLASSES = 'text-xs text-slate-500 mt-1'
const OPTIONAL_LABEL_CLASSES = 'text-xs text-slate-400 font-normal'
const COMING_SOON_CLASSES = 'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600'
const UPLOAD_BUTTON_CLASSES = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-400 cursor-not-allowed'

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const [formState, formActions] = useAuthForm('signup')

  const handleSubmit = async (e: React.FormEvent) => {
    await formActions.handleEmailPasswordSignup(e)
    if (!formState.error) {
      // Since email confirmation is disabled, user should be logged in immediately
      if (onSuccess) onSuccess()
    }
  }

  const handleGoogleSignUp = async () => {
    await formActions.handleGoogleAuth()
    // Don't call onSuccess here as Google OAuth redirects
  }

  return (
    <div className={FORM_CLASSES}>
      {/* Google Sign Up */}
      <button
        type="button"
        onClick={handleGoogleSignUp}
        disabled={formState.loading}
        className={GOOGLE_BUTTON_CLASSES}
      >
        <div className="flex items-center justify-center gap-3">
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {formState.loading ? 'Creating account...' : 'Sign up with Google'}
        </div>
      </button>

      {/* Divider */}
      <div className={DIVIDER_CLASSES}>
        <div className={DIVIDER_LINE_CLASSES} />
        <span className={DIVIDER_TEXT_CLASSES}>OR</span>
      </div>

      {/* Email/Password Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Main form in two columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Account Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Account Details</h3>

            <div className={INPUT_GROUP_CLASSES}>
              <label htmlFor="signup-email" className={LABEL_CLASSES}>
                Email
              </label>
              <input
                type="email"
                id="signup-email"
                value={formState.email}
                onChange={(e) => formActions.setEmail(e.target.value)}
                placeholder="Enter your email"
                className={INPUT_CLASSES}
                disabled={formState.loading}
                required
              />
            </div>

            <div className={INPUT_GROUP_CLASSES}>
              <label htmlFor="signup-password" className={LABEL_CLASSES}>
                Password
              </label>
              <input
                type="password"
                id="signup-password"
                value={formState.password}
                onChange={(e) => formActions.setPassword(e.target.value)}
                placeholder="Create a password (min. 6 characters)"
                className={INPUT_CLASSES}
                disabled={formState.loading}
                minLength={6}
                required
              />
            </div>

            <div className={INPUT_GROUP_CLASSES}>
              <label htmlFor="confirm-password" className={LABEL_CLASSES}>
                Confirm Password
              </label>
              <input
                type="password"
                id="confirm-password"
                value={formState.confirmPassword || ''}
                onChange={(e) => formActions.setConfirmPassword?.(e.target.value)}
                placeholder="Confirm your password"
                className={INPUT_CLASSES}
                disabled={formState.loading}
                required
              />
            </div>
          </div>

          {/* Right Column - Research Profile */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">
                Research Profile <span className={OPTIONAL_LABEL_CLASSES}>(Optional)</span>
              </h3>
            </div>

            <div className={INPUT_GROUP_CLASSES}>
              <label htmlFor="orcid-id" className={LABEL_CLASSES}>
                ORCID iD
              </label>
              <input
                type="text"
                id="orcid-id"
                value={formState.orcidId || ''}
                onChange={(e) => formActions.setOrcidId?.(e.target.value)}
                placeholder="0000-0000-0000-0000"
                className={INPUT_CLASSES}
                disabled={formState.loading}
                pattern="[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]"
              />
            </div>

            <div className={INPUT_GROUP_CLASSES}>
              <label htmlFor="academic-website" className={LABEL_CLASSES}>
                Academic Website
              </label>
              <input
                type="url"
                id="academic-website"
                value={formState.academicWebsite || ''}
                onChange={(e) => formActions.setAcademicWebsite?.(e.target.value)}
                placeholder="https://yoursite.edu"
                className={INPUT_CLASSES}
                disabled={formState.loading}
              />
            </div>

            <div className={INPUT_GROUP_CLASSES}>
              <label className={LABEL_CLASSES}>
                Bibliography <span className={COMING_SOON_CLASSES}>Coming Soon</span>
              </label>
              <button
                type="button"
                disabled
                className={UPLOAD_BUTTON_CLASSES}
              >
                📄 Upload bibliography file
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {formState.error && (
          <div className={ERROR_CLASSES}>
            {formState.error}
          </div>
        )}

        {/* Terms */}
        <p className={TERMS_CLASSES}>
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={formState.loading}
          className={PRIMARY_BUTTON_CLASSES}
        >
          {formState.loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </div>
  )
}