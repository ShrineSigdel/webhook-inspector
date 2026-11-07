import { Link } from 'react-router-dom'
import { primaryButton } from '../lib/styles'

export function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-[var(--accent)]">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--text)]">Not found</h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-[var(--text-muted)]">
        This page or endpoint does not exist, has expired, or belongs to someone else.
      </p>
      <Link to="/" className={`${primaryButton} mt-6`}>
        Back to home
      </Link>
    </div>
  )
}
