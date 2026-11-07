const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export function formatRelative(iso: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  const magnitude = Math.abs(seconds)

  if (magnitude < 60) {
    return relativeFormatter.format(seconds, 'second')
  }
  const minutes = Math.round(seconds / 60)
  if (Math.abs(minutes) < 60) {
    return relativeFormatter.format(minutes, 'minute')
  }
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) {
    return relativeFormatter.format(hours, 'hour')
  }
  return relativeFormatter.format(Math.round(hours / 24), 'day')
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// IDs are BIGSERIAL values sent as strings. Compare without Number(), which
// would lose precision past 2^53.
export function compareRequestIds(a: string, b: string): number {
  return a.length - b.length || a.localeCompare(b)
}
