import type { CapturedRequest } from '../api/client'
import { formatBytes, formatDate, formatRelative } from '../lib/format'

interface Props {
  requests: CapturedRequest[]
  selectedId: string | null
  now: number
  onSelect: (id: string) => void
}

function methodClass(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'bg-emerald-100 text-emerald-700'
    case 'POST':
      return 'bg-sky-100 text-sky-700'
    case 'PUT':
      return 'bg-amber-100 text-amber-700'
    case 'PATCH':
      return 'bg-violet-100 text-violet-700'
    case 'DELETE':
      return 'bg-rose-100 text-rose-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

export function RequestList({ requests, selectedId, now, onSelect }: Props) {
  if (requests.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-slate-500">No requests yet.</p>
  }

  return (
    <ul className="divide-y divide-slate-100">
      {requests.map((request) => {
        const isSelected = request.id === selectedId
        return (
          <li key={request.id}>
            <button
              type="button"
              onClick={() => onSelect(request.id)}
              title={formatDate(request.createdAt)}
              className={`flex w-full items-start gap-3 px-3 py-3 text-left transition ${
                isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'
              }`}
            >
              <span
                className={`mt-0.5 inline-flex min-w-14 justify-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${methodClass(request.method)}`}
              >
                {request.method}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-slate-500">
                  {request.contentType ?? 'no content type'}
                </span>
                <span className="mt-0.5 block text-xs text-slate-400">
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
