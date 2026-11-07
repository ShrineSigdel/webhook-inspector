import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { ErrorNotice } from '../components/ErrorNotice'
import { cardClass, inputClass, primaryButton } from '../lib/styles'

export function Register() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (user) {
    return <Navigate to="/endpoints" replace />
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (password.length < 10) {
      setError('Password must be at least 10 characters.')
      return
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError('Password must be at most 72 bytes.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await register(email, password)
      navigate('/endpoints', { replace: true })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Create an account</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Accounts keep endpoints for 30 days instead of 24 hours.
      </p>

      <form onSubmit={(event) => void submit(event)} className={`${cardClass} mt-6 space-y-4 p-6`}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-[var(--text-muted)]">
            At least 10 characters, at most 72 bytes.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[var(--text-muted)]">
            Confirm password
          </span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className={inputClass}
          />
        </label>

        {error && <ErrorNotice message={error} />}

        <button type="submit" disabled={submitting} className={`${primaryButton} w-full`}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold">
          Log in
        </Link>
      </p>
    </div>
  )
}
