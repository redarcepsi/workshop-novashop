// Client HTTP unique : toutes les requêtes passent par /api (passerelle nginx ou proxy Vite).

const TOKEN_KEY = 'novashop_token'

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

function errorMessage(data, status) {
  if (typeof data?.detail === 'string') return data.detail
  // Erreurs de validation FastAPI : [{ loc, msg, type }, ...]
  if (Array.isArray(data?.detail)) {
    return data.detail.map((d) => d.msg.replace(/^Value error, /, '')).join(' · ')
  }
  if (status >= 500) return 'Le service est momentanément indisponible'
  return `Erreur ${status}`
}

async function request(path, { method = 'GET', body, form, auth = true } = {}) {
  const headers = {}
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
  categories: () => request('/shop/categories', { auth: false }),
  products: (params = {}) => request(`/shop/products?${query(params)}`, { auth: false }),
  product: (slug) => request(`/shop/products/${encodeURIComponent(slug)}`, { auth: false }),

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
}
