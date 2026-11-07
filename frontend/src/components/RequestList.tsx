import type { CapturedRequest } from '../api/client'
import { formatBytes, formatDate, formatRelative } from '../lib/format'

interface Props {
  requests: CapturedRequest[]
  selectedId: string | null
  now: number
  onSelect: (id: string) => void
}

export function RequestList({ requests, selectedId, now, onSelect }: Props) {
  if (requests.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
        No requests yet.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {requests.map((request) => {
        const isSelected = request.id === selectedId
        return (
          <li key={request.id}>
            <button
              type="button"
              onClick={() => onSelect(request.id)}
              title={formatDate(request.createdAt)}
              className={`flex w-full items-start gap-3 border-l-2 px-3 py-3 text-left transition ${
                isSelected
                  ? 'border-[var(--accent)] bg-[var(--bg-selected)]'
                  : 'border-transparent hover:bg-[var(--bg-elevated)]'
              }`}
            >
              <span
                data-method={request.method.toUpperCase()}
                className="mt-0.5 inline-flex min-w-14 justify-center text-[11px] font-bold uppercase tracking-wide"
              >
                {request.method}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-[var(--text-muted)]">
                  {request.contentType ?? 'no content type'}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                  {formatRelative(request.createdAt, now)} · {formatBytes(request.sizeBytes)}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
