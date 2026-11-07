import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { Loading } from './Loading'

export function ProtectedRoute() {
  const { user, restoring } = useAuth()
  const location = useLocation()

  if (restoring) {
    return <Loading label="Checking your session…" />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
