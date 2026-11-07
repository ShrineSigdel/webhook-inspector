import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  loginRequest,
  logoutRequest,
  refresh,
  registerRequest,
  setSessionExpiredHandler,
  type User,
} from '../api/client'
import { AuthContext } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [restoring, setRestoring] = useState(true)

  useEffect(() => {
    let cancelled = false

    // The access token is gone after a reload, but the refresh cookie is not.
    // Refresh once on startup so a remembered session comes back.
    setSessionExpiredHandler(() => setUser(null))

    refresh()
      .then((data) => {
        if (!cancelled) {
          setUser(data.user)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRestoring(false)
        }
      })

    return () => {
      cancelled = true
      setSessionExpiredHandler(null)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginRequest(email, password)
    setUser(data.user)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    await registerRequest(email, password)
    // Register does not issue tokens, so sign in straight away.
    const data = await loginRequest(email, password)
    setUser(data.user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } finally {
      // Even if the network call failed, drop the local session.
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, restoring, login, register, logout }),
    [user, restoring, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
