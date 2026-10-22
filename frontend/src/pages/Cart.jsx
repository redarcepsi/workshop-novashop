import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CartSummary from '../components/CartSummary.jsx'
import Icon from '../components/Icon.jsx'
import { ProductThumb } from '../components/ProductCard.jsx'
import { Alert, Button, ButtonLink, EmptyState, PD, PageSpinner, QuantityStepper, RarityBadge } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { maxQuantity, useCart } from '../context/CartContext.jsx'
import { formatMoney } from '../utils/format.js'

const productUrl = (product) => (product.kind === 'CARD' ? `/cards/${product.slug}` : '/pokedollars')

function CartLine({ line }) {
  const { setQuantity, removeItem } = useCart()
  const [busy, setBusy] = useState(false)
  const { product } = line

  const run = async (fn) => {
    setBusy(true)
    await fn()
    setBusy(false)
  }
  const limit = maxQuantity(product)
  const stockMax = product.stock ?? limit

  return (
    <li className={`flex gap-4 py-6 transition ${busy ? 'opacity-60' : ''}`}>
      <Link to={productUrl(product)} className="shrink-0">
        <ProductThumb item={product} className="h-28 w-20 sm:h-32 sm:w-[5.7rem]" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-between gap-4">
          <div className="min-w-0">
            <Link to={productUrl(product)} className="font-semibold text-white hover:text-gold-200">
              {product.name}
            </Link>
            {product.kind === 'CARD' ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-night-400">
                {product.card.set.name} · n° {product.card.number}
                <RarityBadge rarity={product.card.rarity} />
              </div>
            ) : (
              <p className="mt-1 text-sm text-night-400">
                <PD amount={product.pokedollars} className="text-gold-200" /> par lot
              </p>
            )}
            <p className="mt-1 text-sm tabular-nums text-night-300">{formatMoney(product.price)} l’unité</p>
          </div>
          <p className="font-semibold tabular-nums text-white">{formatMoney(line.line_total)}</p>
        </div>

        {!line.available && (
          <p className="mt-2 text-sm font-medium text-red-300">
            {product.stock
              ? `Stock insuffisant : plus que ${product.stock} exemplaire(s)`
              : 'Cette carte n’est plus disponible, retirez-la pour continuer'}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-3">
          <QuantityStepper
            value={line.quantity}
            max={Math.max(line.quantity > stockMax ? line.quantity : Math.min(stockMax, limit), 1)}
            disabled={busy}
            onChange={(q) => run(() => setQuantity(product, q))}
          />
          <button
            onClick={() => run(() => removeItem(product))}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-night-400 transition hover:bg-red-500/10 hover:text-red-300"
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
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink to="/cards" className="px-6 py-3">
                Découvrir les cartes <Icon name="arrowRight" className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink to="/pokedollars" variant="secondary" className="px-6 py-3">
                Acheter des PokéDollars
              </ButtonLink>
            </div>
          }
        >
          Ajoutez des cartes à l’unité ou des PokéDollars pour ouvrir des boosters.
        </EmptyState>
      </div>
    )
  }

  const blocked = cart.items.some((i) => !i.available)
  const goToCheckout = () =>
    user ? navigate('/checkout') : navigate('/login', { state: { from: { pathname: '/checkout' } } })

  return (
    <div className="container-page py-10">
      <h1 className="font-display text-4xl font-bold tracking-tight text-white">Mon panier</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-3">
        <ul className="divide-y divide-white/10 border-y border-white/10 lg:col-span-2">
          {cart.items.map((line) => (
            <CartLine key={line.product.id} line={line} />
          ))}
        </ul>

        <aside>
          <div className="panel sticky top-24 p-6">
            <h2 className="mb-5 font-display text-xl font-semibold text-white">Récapitulatif</h2>
            <CartSummary cart={cart}>
              {blocked && <Alert>Certains articles ne sont plus disponibles dans la quantité demandée.</Alert>}
              <Button onClick={goToCheckout} disabled={blocked} className="w-full py-3.5">
                <Icon name="lock" className="h-4 w-4" /> Passer au paiement
              </Button>
              {!user && (
                <p className="text-center text-xs text-night-400">
                  Vous devrez vous connecter ou créer un compte pour finaliser votre commande.
                </p>
              )}
              <Link to="/cards" className="block text-center text-sm font-medium text-gold-300 hover:text-gold-200">
                Continuer mes achats
              </Link>
            </CartSummary>
          </div>
        </aside>
      </div>
    </div>
  )
}
