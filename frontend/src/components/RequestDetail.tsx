import { useState } from 'react'
import type { ReactNode } from 'react'
import type { CapturedRequest } from '../api/client'
import { formatBytes, formatDate } from '../lib/format'
import { codeBlockClass } from '../lib/styles'

const TABS = ['Headers', 'Query', 'Body', 'Raw'] as const
type Tab = (typeof TABS)[number]

// Capture groups: string (with optional key colon), boolean/null, number,
// punctuation. Pretty-printed JSON can be split into spans without parsing
// or dangerouslySetInnerHTML.
const JSON_TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}:,\u005B\u005D])/g

function highlightJson(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let key = 0
  let match: RegExpExecArray | null

  JSON_TOKEN.lastIndex = 0

  while ((match = JSON_TOKEN.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index))
    }

    const token = match[0]

    if (match[1]) {
      nodes.push(
        <span key={key++} className={match[2] ? 'json-key' : 'json-string'}>
          {match[1]}
        </span>,
      )
      if (match[2]) {
        nodes.push(
          <span key={key++} className="json-punct">
            {match[2]}
          </span>,
        )
      }
    } else if (match[3]) {
      nodes.push(
        <span key={key++} className="json-boolean">
          {match[3]}
        </span>,
      )
    } else if (match[4]) {
      nodes.push(
        <span key={key++} className="json-number">
          {match[4]}
        </span>,
      )
    } else {
      nodes.push(
        <span key={key++} className="json-punct">
          {token}
        </span>,
      )
    }

    last = match.index + token.length
  }

  if (last < text.length) {
    nodes.push(text.slice(last))
  }

  return nodes
}

function JsonBlock({ text }: { text: string }) {
  return (
    <pre className={`${codeBlockClass} max-h-[28rem] whitespace-pre`}>
      {highlightJson(text)}
    </pre>
  )
}

function PlainBlock({ text }: { text: string }) {
  return (
    <pre className={`${codeBlockClass} max-h-[28rem] whitespace-pre`}>
      {text}
    </pre>
  )
}

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
    return (
      <p className="px-2 py-4 text-sm text-[var(--text-muted)]">None.</p>
    )
  }
  return (
    <dl className="divide-y divide-[var(--border)]">
      {entries.map(([key, text]) => (
        <div
          key={key}
          className="grid gap-1 px-2 py-2 transition hover:bg-[var(--bg-elevated)] sm:grid-cols-[220px_1fr] sm:gap-4"
        >
          <dt className="break-all text-xs font-medium text-[var(--text-muted)]">{key}</dt>
          <dd className="break-all font-mono text-xs text-[var(--text)]">{text}</dd>
        </div>
      ))}
    </dl>
  )
}

function BodyView({ body, contentType }: { body: string | null; contentType: string | null }) {
  if (!body) {
    return (
      <p className="px-2 py-4 text-sm text-[var(--text-muted)]">No body.</p>
    )
  }

  if (contentType?.toLowerCase().includes('json')) {
    let pretty: string | null = null
    try {
      pretty = JSON.stringify(JSON.parse(body), null, 2) ?? ''
    } catch {
      // Invalid JSON is common from broken integrations; show the raw bytes
      // as text rather than hiding them.
    }

    if (pretty !== null) {
      return <JsonBlock text={pretty} />
    }

    return (
      <div className="space-y-2">
        <p className="text-xs text-[var(--warning)]">
          Body is not valid JSON; showing it as text.
        </p>
        <PlainBlock text={body} />
      </div>
    )
  }

  return <PlainBlock text={body} />
}

export function RequestDetail({ request }: { request: CapturedRequest }) {
  const [tab, setTab] = useState<Tab>('Headers')

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            data-method={request.method.toUpperCase()}
            className="method-chip rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
          >
            {request.method}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {request.contentType ?? 'no content type'}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {formatBytes(request.sizeBytes)}
          </span>
          <span className="text-xs text-[var(--text-muted)]" title={formatDate(request.createdAt)}>
            {formatDate(request.createdAt)}
          </span>
          {request.ip && (
            <span className="text-xs text-[var(--text-muted)]">from {request.ip}</span>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-[var(--border)] px-2">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`-mb-px rounded-t-[var(--radius-sm)] border-b-2 px-3 py-2 text-xs font-semibold transition ${
              tab === item
                ? 'border-[var(--accent)] text-[var(--text)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
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
        {tab === 'Raw' && <JsonBlock text={JSON.stringify(request, null, 2) ?? ''} />}
      </div>
    </div>
  )
}
