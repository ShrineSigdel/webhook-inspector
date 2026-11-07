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
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
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
                  `rounded-lg px-3 py-2 font-medium transition ${
                    isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                  }`
                }
              >
                My endpoints
              </NavLink>
              <span className="hidden max-w-48 truncate text-slate-500 sm:inline" title={user.email}>
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-lg px-3 py-2 font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink
                to="/login"
                className="rounded-lg px-3 py-2 font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Log in
              </NavLink>
              <NavLink
                to="/register"
                className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white transition hover:bg-indigo-500"
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
