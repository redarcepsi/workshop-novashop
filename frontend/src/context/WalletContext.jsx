import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { shopApi } from '../api.js'
import { useAuth } from './AuthContext.jsx'

/*
 * Porte-monnaie de PokéDollars de l'utilisateur connecté (null pour un visiteur ou pendant le chargement).
 * Le solde fait foi côté serveur : on le relit après un paiement, et l'ouverture d'un booster renvoie le nouveau.
 */

const WalletContext = createContext(null)

export function WalletProvider({ children }) {
  const { user } = useAuth()
  const [wallet, setWallet] = useState(null)

  const refresh = useCallback(async () => {
    if (!user) return setWallet(null)
    try {
      setWallet(await shopApi.wallet())
    } catch {
      /* solde indisponible (service en panne) : on garde le précédent */
    }
  }, [user])

  useEffect(() => {
    setWallet(null)
    refresh()
  }, [refresh])

  const setBalance = useCallback((balance) => setWallet((w) => (w ? { ...w, balance } : { balance, entries: [] })), [])

  const value = useMemo(
    () => ({ balance: wallet?.balance ?? null, entries: wallet?.entries ?? [], refresh, setBalance }),
    [wallet, refresh, setBalance],
  )
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet doit être utilisé dans <WalletProvider>')
  return ctx
}
