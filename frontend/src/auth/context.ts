import { createContext } from 'react'
import type { User } from '../api/client'

export interface AuthContextValue {
  user: User | null
  restoring: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
