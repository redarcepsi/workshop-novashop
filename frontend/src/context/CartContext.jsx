import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { shopApi } from '../api.js'
import { useAuth } from './AuthContext.jsx'

/*
 * Panier hybride :
 *  - visiteur  → lignes { product_id, quantity } en localStorage, chiffrées par POST /cart/quote
 *  - connecté  → panier stocké côté serveur (shop-service)
 * À la connexion, le panier invité est fusionné dans celui du compte (POST /cart/merge).
 */

const GUEST_KEY = 'pokebling_guest_cart'
const MAX_QTY = 10

export const EMPTY_CART = {
  items: [],
  items_count: 0,
  total: '0.00',
  pokedollars: 0,
  cards_count: 0,
}

const guestStore = {
  read() {
    try {
      const items = JSON.parse(localStorage.getItem(GUEST_KEY))
      return Array.isArray(items) ? items : []
    } catch {
      return []
    }
  },
  write(items) {
    try {
      if (items.length) localStorage.setItem(GUEST_KEY, JSON.stringify(items))
      else localStorage.removeItem(GUEST_KEY)
    } catch {
      /* stockage indisponible : le panier invité ne sera pas conservé */
    }
  },
}

async function saveGuest(items) {
  const quoted = items.length ? await shopApi.quote(items) : EMPTY_CART
  guestStore.write(items)
  return quoted
}

// stock null : illimité (lots de PokéDollars)
function stockError(product, wanted) {
  if (wanted > MAX_QTY) return `Maximum ${MAX_QTY} exemplaires par article`
  if (product.stock != null && wanted > product.stock) {
    return product.stock
      ? `Stock insuffisant : plus que ${product.stock} exemplaire(s)`
      : `« ${product.name} » est en rupture de stock`
  }
  return null
}

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [cart, setCart] = useState(EMPTY_CART)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState(null)
  const mergeRef = useRef(null)

  const notify = useCallback((n) => setNotice({ id: Date.now(), ...n }), [])
  const dismissNotice = useCallback(() => setNotice(null), [])

  const loadCart = useCallback(async () => {
    if (!user) return saveGuest(guestStore.read())

    const guest = guestStore.read()
    if (guest.length && !mergeRef.current) {
      guestStore.write([])
      mergeRef.current = shopApi
        .mergeCart(guest)
        .catch((e) => {
          guestStore.write(guest)
          throw e
        })
        .finally(() => {
          mergeRef.current = null
        })
    }
    // Si une fusion est en cours (double effet en mode StrictMode), on attend son résultat
    return mergeRef.current ?? shopApi.cart()
  }, [user])

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    loadCart()
      .then((c) => !cancelled && setCart(c))
      .catch(() => !cancelled && setCart(EMPTY_CART))
      .finally(() => !cancelled && setReady(true))
    return () => {
      cancelled = true
    }
  }, [authLoading, loadCart])

  const refresh = useCallback(() => loadCart().then(setCart).catch(() => {}), [loadCart])

  const addItem = useCallback(
    async (product, quantity = 1) => {
      try {
        if (user) {
          setCart(await shopApi.addItem(product.id, quantity))
        } else {
          const items = guestStore.read()
          const current = items.find((i) => i.product_id === product.id)?.quantity ?? 0
          const error = stockError(product, current + quantity)
          if (error) throw new Error(error)
          const next = current
            ? items.map((i) => (i.product_id === product.id ? { ...i, quantity: current + quantity } : i))
            : [...items, { product_id: product.id, quantity }]
          setCart(await saveGuest(next))
        }
        notify({ tone: 'success', product, quantity })
        return true
      } catch (e) {
        notify({ tone: 'error', message: e.message })
        return false
      }
    },
    [user, notify],
  )

  const setQuantity = useCallback(
    async (product, quantity) => {
      try {
        if (user) {
          setCart(await shopApi.updateItem(product.id, quantity))
        } else {
          const error = stockError(product, quantity)
          if (error) throw new Error(error)
          const next = guestStore.read().map((i) => (i.product_id === product.id ? { ...i, quantity } : i))
          setCart(await saveGuest(next))
        }
      } catch (e) {
        notify({ tone: 'error', message: e.message })
      }
    },
    [user, notify],
  )

  const removeItem = useCallback(
    async (product) => {
      try {
        if (user) setCart(await shopApi.removeItem(product.id))
        else setCart(await saveGuest(guestStore.read().filter((i) => i.product_id !== product.id)))
      } catch (e) {
        notify({ tone: 'error', message: e.message })
      }
    },
    [user, notify],
  )

  const value = useMemo(
    () => ({ cart, ready, addItem, setQuantity, removeItem, refresh, notice, dismissNotice }),
    [cart, ready, addItem, setQuantity, removeItem, refresh, notice, dismissNotice],
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart doit être utilisé dans <CartProvider>')
  return ctx
}
