export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-[var(--text-muted)]">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
      <span>{label}</span>
    </div>
  )
}
