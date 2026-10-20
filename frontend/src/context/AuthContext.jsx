import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi, setUnauthorizedHandler, tokenStore } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()))

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  // Un 401 renvoyé par n'importe quelle API déconnecte l'utilisateur (jeton expiré)
  useEffect(() => {
    setUnauthorizedHandler(logout)
  }, [logout])

  // Restauration de la session au chargement
  useEffect(() => {
    if (!tokenStore.get()) return
    authApi
      .me()
      .then(setUser)
      .catch(logout)
      .finally(() => setLoading(false))
  }, [logout])

  const login = useCallback(async (email, password) => {
    const { access_token } = await authApi.login(email, password)
    tokenStore.set(access_token)
    const me = await authApi.me()
    setUser(me)
    return me
  }, [])

  const register = useCallback(
    async (payload) => {
      await authApi.register(payload)
      return login(payload.email, payload.password)
    },
    [login],
  )

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}
