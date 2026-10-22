// Client HTTP unique : toutes les requêtes passent par /api (passerelle nginx ou proxy Vite).

const TOKEN_KEY = 'pokebling_token'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn
}

// Messages par défaut de FastAPI/Starlette, toujours en anglais
const DEFAULT_DETAILS = {
  'Not Found': 'Ressource introuvable',
  'Not authenticated': 'Vous devez être connecté',
  'Method Not Allowed': 'Action non autorisée',
  'Internal Server Error': 'Erreur interne du serveur',
  'There was an error parsing the body': 'Requête invalide',
}

const STATUS_MESSAGES = {
  404: 'Ressource introuvable',
  405: 'Action non autorisée',
  413: 'La requête est trop volumineuse',
  429: 'Trop de requêtes, veuillez réessayer dans quelques instants',
}

const FIELD_LABELS = {
  email: 'Email',
  username: 'Email',
  password: 'Mot de passe',
  full_name: 'Nom complet',
  card_number: 'Numéro de carte',
  expiry: 'Expiration',
  cvc: 'CVC',
  quantity: 'Quantité',
  product_id: 'Produit',
  items: 'Panier',
}

// Champs dont le format est contrôlé par une expression régulière : le motif brut n'a pas de sens pour le client
const PATTERN_MESSAGES = {
  expiry: "Date d'expiration invalide (format MM/AA)",
  cvc: 'Le CVC doit comporter 3 ou 4 chiffres',
}

// Traduit une erreur de validation Pydantic v2 ({ loc, msg, type, ctx }) en français
function validationMessage({ loc = [], msg = '', type, ctx = {} }) {
  const field = [...loc].reverse().find((part) => typeof part === 'string')
  const label = FIELD_LABELS[field] || 'Champ'
  switch (type) {
    case 'missing':
      return `${label} : champ obligatoire`
    case 'string_too_short':
      return `${label} : ${ctx.min_length} caractère(s) minimum`
    case 'string_too_long':
      return `${label} : ${ctx.max_length} caractères maximum`
    case 'string_pattern_mismatch':
      return PATTERN_MESSAGES[field] || `${label} : format invalide`
    case 'too_long':
      return `${label} : ${ctx.max_length} éléments maximum`
    case 'greater_than_equal':
      return `${label} : la valeur doit être supérieure ou égale à ${ctx.ge}`
    case 'greater_than':
      return `${label} : la valeur doit être supérieure à ${ctx.gt}`
    case 'less_than_equal':
      return `${label} : la valeur doit être inférieure ou égale à ${ctx.le}`
    case 'less_than':
      return `${label} : la valeur doit être inférieure à ${ctx.lt}`
    case 'int_parsing':
    case 'int_type':
    case 'float_parsing':
    case 'decimal_parsing':
      return `${label} : nombre attendu`
    case 'json_invalid':
      return 'Requête invalide'
    case 'value_error':
      // Nos validateurs lèvent déjà des messages en français, préfixés par Pydantic
      if (msg.startsWith('Value error, ')) return msg.slice('Value error, '.length)
      if (msg.startsWith('value is not a valid email address')) return 'Adresse email invalide'
      return `${label} : valeur invalide`
    default:
      return `${label} : valeur invalide`
  }
}

function errorMessage(data, status) {
  if (typeof data?.detail === 'string') return DEFAULT_DETAILS[data.detail] || data.detail
  // Erreurs de validation FastAPI : [{ loc, msg, type, ctx }, ...]
  if (Array.isArray(data?.detail)) {
    return [...new Set(data.detail.map(validationMessage))].join(' · ')
  }
  if (status >= 500) return 'Le service est momentanément indisponible'
  return STATUS_MESSAGES[status] || `Erreur ${status}`
}

async function request(path, { method = 'GET', body, form, auth = true, headers: extraHeaders = {} } = {}) {
  const headers = { ...extraHeaders }
  const token = tokenStore.get()
  if (auth && token) headers.Authorization = `Bearer ${token}`

  let payload
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    payload = new URLSearchParams(form)
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload })
  } catch {
    throw new ApiError('Impossible de joindre le serveur', 0)
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && auth) onUnauthorized()
    throw new ApiError(errorMessage(data, res.status), res.status)
  }
  return data
}

const query = (params) => {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) q.set(key, value)
  }
  return q.toString()
}

export const authApi = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (email, password) =>
    request('/auth/login', { method: 'POST', form: { username: email, password }, auth: false }),
  me: () => request('/auth/me'),
}

export const shopApi = {
  // Catalogue (public)
  sets: () => request('/shop/sets', { auth: false }),
  setCards: (setId) => request(`/shop/sets/${encodeURIComponent(setId)}/cards`, { auth: false }),
  products: (params = {}) => request(`/shop/products?${query(params)}`, { auth: false }),
  product: (slug) => request(`/shop/products/${encodeURIComponent(slug)}`, { auth: false }),
  boosters: () => request('/shop/boosters', { auth: false }),

  // Boosters : la clé d'idempotence évite d'ouvrir (et de payer) deux fois sur un double clic ou une relance
  openBooster: (slug, requestId) =>
    request(`/shop/boosters/${encodeURIComponent(slug)}/open`, { method: 'POST', headers: { 'Idempotency-Key': requestId } }),
  // Plusieurs boosters d'un coup : tous payés et ouverts, ou aucun
  openBoosters: (slug, count, requestId) =>
    request(`/shop/boosters/${encodeURIComponent(slug)}/open-batch?count=${count}`, {
      method: 'POST',
      headers: { 'Idempotency-Key': requestId },
    }),

  // Panier
  quote: (items) => request('/shop/cart/quote', { method: 'POST', body: { items }, auth: false }),
  cart: () => request('/shop/cart'),
  addItem: (productId, quantity) =>
    request('/shop/cart/items', { method: 'POST', body: { product_id: productId, quantity } }),
  updateItem: (productId, quantity) =>
    request(`/shop/cart/items/${productId}`, { method: 'PATCH', body: { quantity } }),
  removeItem: (productId) => request(`/shop/cart/items/${productId}`, { method: 'DELETE' }),
  mergeCart: (items) => request('/shop/cart/merge', { method: 'POST', body: { items } }),

  // Commandes
  checkout: (payload) => request('/shop/orders', { method: 'POST', body: payload }),
  orders: () => request('/shop/orders'),
  order: (id) => request(`/shop/orders/${id}`),
  cancelOrder: (id) => request(`/shop/orders/${id}/cancel`, { method: 'POST' }),

  // Compte
  wallet: () => request('/shop/wallet'),
  collection: () => request('/shop/collection'),
}
