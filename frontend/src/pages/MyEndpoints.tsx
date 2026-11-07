import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createEndpoint,
  deleteEndpoint,
  errorMessage,
  listMyEndpoints,
  type Endpoint,
} from '../api/client'
import { ErrorNotice } from '../components/ErrorNotice'
import { Loading } from '../components/Loading'
import { useNow } from '../hooks/useNow'
import { formatDate, formatRelative } from '../lib/format'
import { cardClass, dangerButton, primaryButton, secondaryButton } from '../lib/styles'

export function MyEndpoints() {
  const navigate = useNavigate()
  const [endpoints, setEndpoints] = useState<Endpoint[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const now = useNow()

  useEffect(() => {
    let cancelled = false

    listMyEndpoints()
      .then((data) => {
        if (!cancelled) {
          setEndpoints(data.endpoints)
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(errorMessage(caught))
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

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

  const remove = async (endpoint: Endpoint) => {
    if (
      !window.confirm(
        `Delete endpoint ${endpoint.id}? Its captured requests are deleted too.`,
      )
    ) {
      return
    }

    setDeletingId(endpoint.id)
    setError(null)
    try {
      await deleteEndpoint(endpoint.id)
      setEndpoints((previous) =>
        previous ? previous.filter((item) => item.id !== endpoint.id) : previous,
      )
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My endpoints</h1>
          <p className="mt-1 text-sm text-slate-600">
            Endpoints you own. Each one lasts 30 days from creation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void create()}
          disabled={creating}
          className={primaryButton}
        >
          {creating ? 'Creating…' : 'New endpoint'}
        </button>
      </div>

      {error && <ErrorNotice message={error} />}

      {endpoints === null ? (
        <Loading label="Loading endpoints…" />
      ) : endpoints.length === 0 ? (
        <div className={`${cardClass} p-10 text-center`}>
          <h2 className="text-base font-semibold text-slate-900">No endpoints yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Create one and send it a request. It will appear here and stay available for
            30 days.
          </p>
          <button
            type="button"
            onClick={() => void create()}
            disabled={creating}
            className={`${primaryButton} mt-5`}
          >
            {creating ? 'Creating…' : 'Create your first endpoint'}
          </button>
        </div>
      ) : (
        <ul className={`${cardClass} divide-y divide-slate-100`}>
          {endpoints.map((endpoint) => (
            <li
              key={endpoint.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <Link
                  to={`/endpoints/${endpoint.id}`}
                  className="font-mono text-sm font-semibold text-indigo-600 hover:text-indigo-500"
                >
                  {endpoint.id}
                </Link>
                <p className="mt-1 truncate text-xs text-slate-500">{endpoint.url}</p>
                <p className="mt-1 text-xs text-slate-400" title={formatDate(endpoint.expiresAt)}>
                  Expires {formatRelative(endpoint.expiresAt, now)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  to={`/endpoints/${endpoint.id}`}
                  className={`${secondaryButton} px-3 py-1.5 text-xs`}
                >
                  Open
                </Link>
                <button
                  type="button"
                  onClick={() => void remove(endpoint)}
                  disabled={deletingId === endpoint.id}
                  className={dangerButton}
                >
                  {deletingId === endpoint.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
