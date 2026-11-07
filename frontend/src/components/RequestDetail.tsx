import { useState } from 'react'
import type { CapturedRequest } from '../api/client'
import { formatBytes, formatDate } from '../lib/format'

const TABS = ['Headers', 'Query', 'Body', 'Raw'] as const
type Tab = (typeof TABS)[number]

function toEntries(value: unknown): Array<[string, string]> {
  if (typeof value !== 'object' || value === null) {
    return []
  }
  return Object.entries(value).map(([key, raw]) => [
    key,
    Array.isArray(raw) ? raw.join(', ') : String(raw ?? ''),
  ])
}

function KeyValueTable({ value }: { value: unknown }) {
  const entries = toEntries(value)
  if (entries.length === 0) {
    return <p className="px-1 py-4 text-sm text-slate-500">None.</p>
  }
  return (
    <dl className="divide-y divide-slate-100">
      {entries.map(([key, text]) => (
        <div key={key} className="grid gap-1 px-1 py-2 sm:grid-cols-[220px_1fr] sm:gap-4">
          <dt className="break-all text-xs font-medium text-slate-500">{key}</dt>
          <dd className="break-all font-mono text-xs text-slate-800">{text}</dd>
        </div>
      ))}
    </dl>
  )
}

function BodyView({ body, contentType }: { body: string | null; contentType: string | null }) {
  if (!body) {
    return <p className="px-1 py-4 text-sm text-slate-500">No body.</p>
  }

  let text = body
  let note: string | null = null

  if (contentType?.toLowerCase().includes('json')) {
    try {
      text = JSON.stringify(JSON.parse(body), null, 2)
    } catch {
      // Invalid JSON is common from broken integrations; show the raw bytes
      // as text rather than hiding them.
      note = 'Body is not valid JSON; showing it as text.'
    }
  }

  return (
    <div className="space-y-2">
      {note && <p className="text-xs text-amber-700">{note}</p>}
      {/* React escapes text, so a captured <script> tag can never run here. */}
      <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
        {text}
      </pre>
    </div>
  )
}

export function RequestDetail({ request }: { request: CapturedRequest }) {
  const [tab, setTab] = useState<Tab>('Headers')

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-white">
            {request.method}
          </span>
          <span className="text-xs text-slate-500">{request.contentType ?? 'no content type'}</span>
          <span className="text-xs text-slate-400">{formatBytes(request.sizeBytes)}</span>
          <span className="text-xs text-slate-400" title={formatDate(request.createdAt)}>
            {formatDate(request.createdAt)}
          </span>
          {request.ip && <span className="text-xs text-slate-400">from {request.ip}</span>}
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 px-2 pt-2">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-t-lg px-3 py-2 text-xs font-semibold transition ${
              tab === item
                ? 'border-b-2 border-indigo-600 text-indigo-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {tab === 'Headers' && <KeyValueTable value={request.headers} />}
        {tab === 'Query' && <KeyValueTable value={request.query} />}
        {tab === 'Body' && (
          <BodyView body={request.body} contentType={request.contentType} />
        )}
        {tab === 'Raw' && (
          <pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
            {JSON.stringify(request, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}
