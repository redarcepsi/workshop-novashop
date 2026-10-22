import { useEffect, useState } from 'react'
import { authApi } from '../api.js'

// Mode démo (SEED_DEMO_USERS d'auth-service) : comptes en un clic à la connexion, cartes de test au paiement.
// Lu une fois par chargement de l'application. Masqué tant qu'il n'est pas connu ou si auth-service ne répond pas
const NO_DEMO = { enabled: false, accounts: [] }
let cached = null
let pending = null

export function useDemo() {
  const [demo, setDemo] = useState(cached || NO_DEMO)

  useEffect(() => {
    if (cached) return
    let active = true
    if (!pending) {
      pending = authApi
        .demo()
        .then((d) => (cached = d))
        .catch(() => {
          pending = null // nouvel essai au prochain affichage
          return NO_DEMO
        })
    }
    pending.then((d) => active && setDemo(d))
    return () => {
      active = false
    }
  }, [])

  return demo
}
