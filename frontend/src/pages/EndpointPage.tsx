import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ApiError,
  clearRequests,
  errorMessage,
  getEndpoint,
  getRequests,
  type CapturedRequest,
  type Endpoint,
} from '../api/client'
import { CopyButton } from '../components/CopyButton'
import { CurlCommand } from '../components/CurlCommand'
import { ErrorNotice } from '../components/ErrorNotice'
import { Loading } from '../components/Loading'
import { RequestDetail } from '../components/RequestDetail'
import { RequestList } from '../components/RequestList'
import { useLiveRequests, type StreamStatus } from '../hooks/useLiveRequests'
import { useNow } from '../hooks/useNow'
import { compareRequestIds, formatDate, formatRelative } from '../lib/format'
import { cardClass, dangerButton, inputClass, secondaryButton } from '../lib/styles'
import { NotFound } from './NotFound'

const PAGE_SIZE = 50

const STATUS_STYLE: Record<StreamStatus, { label: string; dot: string; text: string }> = {
  off: { label: 'Stream off', dot: 'bg-[var(--text-faint)]', text: 'text-[var(--text-muted)]' },
  connecting: { label: 'Connecting…', dot: 'bg-[var(--warning)]', text: 'text-[var(--warning)]' },
  live: { label: 'Live', dot: 'live-dot', text: 'text-[var(--success)]' },
  reconnecting: { label: 'Reconnecting…', dot: 'bg-[var(--warning)]', text: 'text-[var(--warning)]' },
}

function StreamBadge({ status }: { status: StreamStatus }) {
  const style = STATUS_STYLE[status]
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-semibold ${style.text}`}>
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  )
}

function EmptyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-10 w-10 text-[var(--text-faint)]"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

// History and live events can overlap while a page is loading or reconnecting.
// Merge by id so an event is shown exactly once, and the server's version wins
// when both copies exist.
function mergeById(
  existing: CapturedRequest[],
  incoming: CapturedRequest[],
): CapturedRequest[] {
  const byId = new Map(existing.map((request) => [request.id, request]))
  for (const request of incoming) {
    byId.set(request.id, request)
  }
  return [...byId.values()].sort((a, b) => compareRequestIds(b.id, a.id))
}

export function EndpointPage() {
  const { id } = useParams<{ id: string }>()

  if (!id) {
    return <NotFound />
  }

  // A keyed child remounts when the route id changes, so none of the
  // per-endpoint state needs to be reset by an effect.
  return <EndpointView key={id} id={id} />
}

function EndpointView({ id }: { id: string }) {
  const [endpoint, setEndpoint] = useState<Endpoint | null>(null)
  const [requests, setRequests] = useState<CapturedRequest[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const now = useNow()

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const loaded = await getEndpoint(id)
        if (cancelled) {
          return
        }
        setEndpoint(loaded)

        const page = await getRequests(id, { limit: PAGE_SIZE })
        if (cancelled) {
          return
        }
        setRequests((previous) => mergeById(previous, page.requests))
        setNextBefore(page.nextBefore)
        setSelectedId((current) => current ?? page.requests[0]?.id ?? null)
      } catch (caught) {
        if (cancelled) {
          return
        }
        // A stranger asking for an owned endpoint gets the same 404 as a
        // missing endpoint, so the UI only ever says "not found".
        if (caught instanceof ApiError && caught.status === 404) {
          setNotFound(true)
        } else {
          setError(errorMessage(caught))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [id])

  const mergeRequests = useCallback((incoming: CapturedRequest[]) => {
    setRequests((previous) => mergeById(previous, incoming))
  }, [])

  const handleLiveRequest = useCallback((request: CapturedRequest) => {
    setRequests((previous) =>
      previous.some((item) => item.id === request.id)
        ? previous
        : [request, ...previous],
    )
    setSelectedId((current) => current ?? request.id)
  }, [])

  const refetchHistory = useCallback(() => {
    void getRequests(id, { limit: PAGE_SIZE })
      .then((page) => {
        mergeRequests(page.requests)
        setNextBefore((current) => current ?? page.nextBefore)
      })
      .catch(() => {
        // A transient refetch failure is not worth an error banner; the next
        // reconnect tries again.
      })
  }, [id, mergeRequests])

  const status = useLiveRequests({
    endpointId: id,
    owned: endpoint?.owned ?? false,
    enabled: Boolean(endpoint),
    onRequest: handleLiveRequest,
    onReconnect: refetchHistory,
  })

  const loadOlder = async () => {
    if (!nextBefore) {
      return
    }
    setLoadingOlder(true)
    setError(null)
    try {
      const page = await getRequests(id, { limit: PAGE_SIZE, before: nextBefore })
      mergeRequests(page.requests)
      setNextBefore(page.nextBefore)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoadingOlder(false)
    }
  }

  const clearHistory = async () => {
    if (!window.confirm('Clear all captured requests for this endpoint?')) {
      return
    }
    setClearing(true)
    setError(null)
    try {
      await clearRequests(id)
      setRequests([])
      setSelectedId(null)
      setNextBefore(null)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setClearing(false)
    }
  }

  if (loading) {
    return <Loading label="Loading endpoint…" />
  }

  if (notFound) {
    return <NotFound />
  }

  if (error && !endpoint) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <ErrorNotice message={error} />
      </div>
    )
  }

  if (!endpoint) {
    return <NotFound />
  }

  const selected = requests.find((request) => request.id === selectedId) ?? null

  return (
    <div className="space-y-4">
      <section className={`${cardClass} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-[var(--text)]">Endpoint</h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${
                  endpoint.owned
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                }`}
              >
                {endpoint.owned ? 'Yours' : 'Guest link'}
              </span>
            </div>
            <p
              className="mt-1 text-xs text-[var(--text-muted)]"
              title={formatDate(endpoint.expiresAt)}
            >
              Expires {formatRelative(endpoint.expiresAt, now)}
            </p>
          </div>
          <StreamBadge status={status} />
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            readOnly
            value={endpoint.url}
            aria-label="Hook URL"
            onFocus={(event) => event.currentTarget.select()}
            className={`${inputClass} font-mono text-xs`}
          />
          <CopyButton value={endpoint.url} label="Copy URL" />
        </div>

        {!endpoint.owned && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            This is a guest endpoint. Anyone with the link can view it, and it expires 24
            hours after creation.
          </p>
        )}
      </section>

      {error && <ErrorNotice message={error} />}

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
        <section className={`${cardClass} overflow-hidden`}>
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              Requests
              <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                {requests.length}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => void clearHistory()}
              disabled={clearing || requests.length === 0}
              className={dangerButton}
            >
              {clearing ? 'Clearing…' : 'Clear history'}
            </button>
          </div>

          {requests.length === 0 ? (
            <div className="p-4">
              <p className="text-sm text-[var(--text-muted)]">
                Nothing captured yet. Send this endpoint a request:
              </p>
              <div className="mt-3">
                <CurlCommand url={endpoint.url} />
              </div>
            </div>
          ) : (
            <>
              <div className="max-h-[32rem] overflow-y-auto lg:max-h-[calc(100vh-20rem)]">
                <RequestList
                  requests={requests}
                  selectedId={selectedId}
                  now={now}
                  onSelect={setSelectedId}
                />
              </div>
              {nextBefore && (
                <div className="border-t border-[var(--border)] p-3">
                  <button
                    type="button"
                    onClick={() => void loadOlder()}
                    disabled={loadingOlder}
                    className={`${secondaryButton} w-full`}
                  >
                    {loadingOlder ? 'Loading…' : 'Load older'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <section className={`${cardClass} min-h-64 overflow-hidden lg:min-h-[32rem]`}>
          {selected ? (
            <RequestDetail key={selected.id} request={selected} />
          ) : (
            <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-[var(--text-muted)]">
              <EmptyIcon />
              <p>
                {requests.length === 0
                  ? 'Captured requests will appear here, live.'
                  : 'Select a request to inspect it.'}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
