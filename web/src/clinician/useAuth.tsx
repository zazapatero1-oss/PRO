import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../api'
import type { AuthUser } from '../api/types'

interface AuthValue {
  user: AuthUser | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue>({ user: null, loading: true, signOut: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    api
      .getUser()
      .then((u) => alive && setUser(u))
      .finally(() => alive && setLoading(false))
    const off = api.onAuthChange((u) => alive && setUser(u))
    return () => {
      alive = false
      off()
    }
  }, [])

  return <AuthContext.Provider value={{ user, loading, signOut: () => api.signOut() }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
