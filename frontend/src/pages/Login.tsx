import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { ErrorNotice } from '../components/ErrorNotice'
import { cardClass, inputClass, primaryButton } from '../lib/styles'

export function Login() {
  const { user, login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const state = location.state as { from?: string } | null
  const from = state?.from ?? '/endpoints'

  if (user) {
    return <Navigate to={from} replace />
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Log in</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Sign in to keep endpoints for 30 days and see them all in one place.
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
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
        </label>

        {error && <ErrorNotice message={error} />}

        <button type="submit" disabled={submitting} className={`${primaryButton} w-full`}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
        No account?{' '}
        <Link to="/register" className="font-semibold">
          Create one
        </Link>
      </p>
    </div>
  )
}
