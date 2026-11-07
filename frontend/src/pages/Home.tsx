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

const FEATURES = [
  {
    title: 'Any request',
    text: 'GET, POST, PUT, PATCH, DELETE and everything else. JSON, forms, text, binary.',
  },
  {
    title: 'Live updates',
    text: 'A Server-Sent Events stream pushes each capture to your open dashboard.',
  },
  {
    title: 'Safe by default',
    text: 'Captured content is untrusted. The UI renders it as text, never as HTML.',
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
    <div className="space-y-12">
      <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">
            Webhook Inspector
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            See what your webhooks send.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
            Create a URL, send it any HTTP request, and inspect every header, query
            parameter and body as it arrives.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
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
            <div className="mt-4">
              <ErrorNotice message={error} />
            </div>
          )}

          <p className="mt-3 text-xs text-slate-500">
            {user
              ? 'Signed in: new endpoints last 30 days.'
              : 'Guest endpoints last 24 hours. Sign in to keep them for 30 days.'}
          </p>
        </div>

        <div className={`${cardClass} p-6`}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            How it works
          </h2>
          <ol className="mt-4 space-y-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                  {index + 1}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{step.title}</span>
                  <span className="mt-0.5 block text-sm text-slate-600">{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className={`${cardClass} p-5`}>
            <h3 className="text-sm font-semibold text-slate-900">{feature.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.text}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
