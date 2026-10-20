import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CartSummary from '../components/CartSummary.jsx'
import Icon from '../components/Icon.jsx'
import ProductVisual from '../components/ProductVisual.jsx'
import { Alert, Button, ButtonLink, EmptyState, PageSpinner, QuantityStepper } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatMoney } from '../utils/format.js'

function CartLine({ line }) {
  const { setQuantity, removeItem } = useCart()
  const [busy, setBusy] = useState(false)
  const { product } = line

  const run = async (fn) => {
    setBusy(true)
    await fn()
    setBusy(false)
  }

  return (
    <li className={`flex gap-4 py-6 transition ${busy ? 'opacity-60' : ''}`}>
      <Link to={`/products/${product.slug}`} className="group shrink-0">
        <ProductVisual item={product} size="sm" className="h-24 w-24 rounded-2xl sm:h-28 sm:w-28" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-between gap-4">
          <div className="min-w-0">
            <Link to={`/products/${product.slug}`} className="font-semibold text-slate-900 hover:text-brand-700">
              {product.name}
            </Link>
            <p className="text-sm text-slate-500">{product.category.name}</p>
            <p className="mt-1 text-sm tabular-nums text-slate-600">{formatMoney(product.price)} l’unité</p>
          </div>
          <p className="font-semibold tabular-nums text-slate-900">{formatMoney(line.line_total)}</p>
        </div>

        {!line.available && (
          <p className="mt-2 text-sm font-medium text-red-600">
            {product.stock
              ? `Stock insuffisant : plus que ${product.stock} disponible(s)`
              : 'Ce produit n’est plus disponible, retirez-le pour continuer'}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-3">
          <QuantityStepper
            value={line.quantity}
            max={Math.max(line.quantity > product.stock ? line.quantity : Math.min(product.stock, 10), 1)}
            disabled={busy}
            onChange={(q) => run(() => setQuantity(product, q))}
          />
          <button
            onClick={() => run(() => removeItem(product))}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <Icon name="trash" className="h-4 w-4" /> <span className="hidden sm:inline">Retirer</span>
          </button>
        </div>
      </div>
    </li>
  )
}

export default function Cart() {
  const { cart, ready } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()

  if (!ready) return <PageSpinner />

  if (cart.items.length === 0) {
    return (
      <div className="container-page py-10">
        <EmptyState
          icon="bag"
          title="Votre panier est vide"
          action={
            <ButtonLink to="/products" variant="dark" className="px-6 py-3">
              Découvrir la boutique <Icon name="arrowRight" className="h-4 w-4" />
            </ButtonLink>
          }
        >
          Parcourez notre sélection et ajoutez vos coups de cœur.
        </EmptyState>
      </div>
    )
  }

  const blocked = cart.items.some((i) => !i.available)
  const goToCheckout = () =>
    user ? navigate('/checkout') : navigate('/login', { state: { from: { pathname: '/checkout' } } })

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Mon panier</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-3">
        <ul className="divide-y divide-slate-100 border-y border-slate-100 lg:col-span-2">
          {cart.items.map((line) => (
            <CartLine key={line.product.id} line={line} />
          ))}
        </ul>

        <aside>
          <div className="card sticky top-24 p-6">
            <h2 className="mb-5 text-lg font-semibold text-slate-900">Récapitulatif</h2>
            <CartSummary cart={cart}>
              {blocked && <Alert>Certains articles ne sont plus disponibles dans la quantité demandée.</Alert>}
              <Button onClick={goToCheckout} disabled={blocked} variant="dark" className="w-full py-3.5">
                <Icon name="lock" className="h-4 w-4" /> Passer commande
              </Button>
              {!user && (
                <p className="text-center text-xs text-slate-500">
                  Vous devrez vous connecter ou créer un compte pour finaliser votre commande.
                </p>
              )}
              <Link to="/products" className="block text-center text-sm font-medium text-brand-600 hover:text-brand-700">
                Continuer mes achats
              </Link>
            </CartSummary>
          </div>
        </aside>
      </div>
    </div>
  )
}
