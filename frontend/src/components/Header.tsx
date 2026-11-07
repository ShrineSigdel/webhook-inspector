import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      // AuthProvider already cleared the local session.
    } finally {
      navigate('/')
    }
  }

  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg-sidebar)]">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold text-[var(--text)] hover:no-underline"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] text-sm font-bold text-[var(--on-accent)]">
            W
          </span>
          <span>Webhook Inspector</span>
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          {user ? (
            <>
              <NavLink
                to="/endpoints"
                className={({ isActive }) =>
                  `rounded-[var(--radius-md)] px-3 py-2 font-medium transition hover:no-underline ${
                    isActive
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'
                  }`
                }
              >
                My endpoints
              </NavLink>
              <span
                className="hidden max-w-48 truncate text-[var(--text-muted)] sm:inline"
                title={user.email}
              >
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-[var(--radius-md)] px-3 py-2 font-medium text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink
                to="/login"
                className="rounded-[var(--radius-md)] px-3 py-2 font-medium text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text)] hover:no-underline"
              >
                Log in
              </NavLink>
              <NavLink
                to="/register"
                className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)] hover:no-underline"
              >
                Sign up
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
