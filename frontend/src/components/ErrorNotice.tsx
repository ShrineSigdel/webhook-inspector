export function ErrorNotice({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-[var(--radius-md)] border border-[var(--border-danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]"
    >
      {message}
    </p>
  )
}
