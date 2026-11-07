import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createEndpoint, errorMessage } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { ErrorNotice } from '../components/ErrorNotice'
import { cardClass, primaryButton, secondaryButton } from '../lib/styles'

const STEPS = [
  {
    title: 'Create an endpoint',
    text: 'You get a unique URL. No account needed.',
  },
  {
    title: 'Point anything at it',
    text: 'Any method, any content type, up to 1 MB.',
  },
  {
    title: 'Watch it arrive live',
    text: 'Headers, query, body and raw bytes appear instantly.',
  },
]

export function Home() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      const endpoint = await createEndpoint()
      navigate(`/endpoints/${endpoint.id}`)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl py-10 sm:py-16 lg:py-20">
      <section className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Webhook Inspector
        </p>
        <h1 className="mx-auto mt-4 max-w-3xl text-balance text-4xl font-bold leading-[1.1] tracking-tight text-[var(--text)] sm:text-6xl">
          See what your webhooks send.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
          Create a URL, send it any HTTP request, and inspect every header, query
          parameter and body as it arrives.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void create()}
            disabled={creating}
            className={primaryButton}
          >
            {creating ? 'Creating…' : 'Create a free endpoint'}
          </button>
          {user ? (
            <Link to="/endpoints" className={secondaryButton}>
              My endpoints
            </Link>
          ) : (
            <Link to="/register" className={secondaryButton}>
              Create an account
            </Link>
          )}
        </div>

        {error && (
          <div className="mx-auto mt-4 max-w-md text-left">
            <ErrorNotice message={error} />
          </div>
        )}

        <p className="mt-4 text-xs text-[var(--text-muted)]">
          {user
            ? 'Signed in: new endpoints last 30 days.'
            : 'Guest endpoints last 24 hours. Sign in to keep them for 30 days.'}
        </p>
      </section>

      <section className={`${cardClass} mt-16 p-6 sm:mt-20 sm:p-8`}>
        <div className="flex items-center gap-4">
          <h2 className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            How it works
          </h2>
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <ol className="mt-6 grid gap-6 sm:mt-8 sm:grid-cols-3 sm:gap-0">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className={`flex gap-3 sm:block ${
                index > 0 ? 'sm:border-l sm:border-[var(--border)] sm:pl-6' : ''
              } ${index < STEPS.length - 1 ? 'sm:pr-6' : ''}`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]">
                {index + 1}
              </span>
              <div className="sm:mt-4">
                <h3 className="text-sm font-semibold text-[var(--text)]">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
                  {step.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
