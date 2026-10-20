import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { shopApi } from '../api.js'
import CartSummary from '../components/CartSummary.jsx'
import Icon from '../components/Icon.jsx'
import ProductVisual from '../components/ProductVisual.jsx'
import { Alert, Button, Field, PageSpinner } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatCardNumber, formatExpiry, formatMoney } from '../utils/format.js'

const COUNTRIES = ['France', 'Belgique', 'Suisse', 'Luxembourg', 'Canada']
const TEST_CARDS = [
  { number: '4242 4242 4242 4242', label: 'Acceptée' },
  { number: '4000 0000 0000 0002', label: 'Refusée' },
  { number: '4000 0000 0000 9995', label: 'Fonds insuffisants' },
]

function Steps() {
  const steps = ['Panier', 'Livraison & paiement', 'Confirmation']
  return (
    <ol className="mb-10 flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              i === 0 ? 'bg-emerald-500 text-white' : i === 1 ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
            }`}
          >
            {i === 0 ? <Icon name="checkSimple" className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
          </span>
          <span className={`hidden sm:inline ${i === 1 ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{s}</span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-slate-300 sm:w-10" />}
        </li>
      ))}
    </ol>
  )
}

function Section({ number, title, children }) {
  return (
    <section className="card p-6">
      <h2 className="mb-5 flex items-center gap-3 text-lg font-semibold text-slate-900">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
          {number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function Checkout() {
  const { user } = useAuth()
  const { cart, ready, refresh } = useCart()
  const navigate = useNavigate()
  const [shipping, setShipping] = useState({
    full_name: user.full_name,
    address: '',
    postal_code: '',
    city: '',
    country: 'France',
  })
  const [payment, setPayment] = useState({ card_number: '', expiry: '', cvc: '' })
  const [error, setError] = useState('')
  const [placing, setPlacing] = useState(false)

  if (!ready) return <PageSpinner />
  if (cart.items.length === 0 && !placing) return <Navigate to="/cart" replace />

  const setShip = (key) => (e) => setShipping((s) => ({ ...s, [key]: e.target.value }))
  const blocked = cart.items.some((i) => !i.available)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setPlacing(true)
    try {
      const order = await shopApi.checkout({ shipping, payment })
      await refresh() // le serveur a vidé le panier
      navigate(`/orders/${order.id}`, { replace: true, state: { justOrdered: true } })
    } catch (err) {
      setError(err.message)
      setPlacing(false)
      if (err.status === 409) refresh() // stock modifié entre-temps
    }
  }

  return (
    <div className="container-page py-10">
      <Steps />
      <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {error && <Alert>{error}</Alert>}

          <Section number="1" title="Adresse de livraison">
            <div className="grid gap-4 sm:grid-cols-6">
              <Field label="Nom complet" htmlFor="full_name" className="sm:col-span-6">
                <input id="full_name" required minLength={2} maxLength={100} autoComplete="name" className="input" value={shipping.full_name} onChange={setShip('full_name')} />
              </Field>
              <Field label="Adresse" htmlFor="address" className="sm:col-span-6">
                <input id="address" required minLength={5} maxLength={200} autoComplete="street-address" className="input" placeholder="12 rue des Lilas" value={shipping.address} onChange={setShip('address')} />
              </Field>
              <Field label="Code postal" htmlFor="postal_code" className="sm:col-span-2">
                <input id="postal_code" required pattern="[A-Za-z0-9 \-]{3,10}" autoComplete="postal-code" className="input" placeholder="75011" value={shipping.postal_code} onChange={setShip('postal_code')} />
              </Field>
              <Field label="Ville" htmlFor="city" className="sm:col-span-4">
                <input id="city" required maxLength={100} autoComplete="address-level2" className="input" placeholder="Paris" value={shipping.city} onChange={setShip('city')} />
              </Field>
              <Field label="Pays" htmlFor="country" className="sm:col-span-6">
                <select id="country" className="input" value={shipping.country} onChange={setShip('country')}>
                  {COUNTRIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          <Section number="2" title="Paiement par carte">
            <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <Icon name="alert" className="h-4 w-4 shrink-0" />
              <span className="mr-1">Paiement fictif. Cartes de test :</span>
              {TEST_CARDS.map((c) => (
                <button
                  key={c.number}
                  type="button"
                  onClick={() => setPayment({ card_number: c.number, expiry: '12/30', cvc: '123' })}
                  className="rounded-md bg-white px-2 py-1 font-mono ring-1 ring-amber-200 transition hover:ring-amber-400"
                >
                  {c.number} <span className="font-sans text-amber-700">({c.label})</span>
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-6">
              <Field label="Numéro de carte" htmlFor="card" className="sm:col-span-6">
                <div className="relative">
                  <input
                    id="card"
                    required
                    inputMode="numeric"
                    autoComplete="off"
                    className="input pr-11 font-mono tracking-wider"
                    placeholder="4242 4242 4242 4242"
                    value={payment.card_number}
                    onChange={(e) => setPayment((p) => ({ ...p, card_number: formatCardNumber(e.target.value) }))}
                  />
                  <Icon name="card" className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                </div>
              </Field>
              <Field label="Expiration" htmlFor="expiry" className="sm:col-span-3">
                <input
                  id="expiry"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  className="input font-mono"
                  placeholder="MM/AA"
                  value={payment.expiry}
                  onChange={(e) => setPayment((p) => ({ ...p, expiry: formatExpiry(e.target.value) }))}
                />
              </Field>
              <Field label="CVC" htmlFor="cvc" className="sm:col-span-3">
                <input
                  id="cvc"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  className="input font-mono"
                  placeholder="123"
                  value={payment.cvc}
                  onChange={(e) => setPayment((p) => ({ ...p, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                />
              </Field>
            </div>
          </Section>
        </div>

        <aside className="lg:col-span-2">
          <div className="card sticky top-24 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Votre commande</h2>
              <Link to="/cart" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                Modifier
              </Link>
            </div>
            <ul className="mb-6 max-h-72 space-y-4 overflow-y-auto pr-1">
              {cart.items.map(({ product, quantity, line_total }) => (
                <li key={product.id} className="flex items-center gap-3">
                  <div className="relative">
                    <ProductVisual item={product} size="xs" className="h-14 w-14 rounded-xl" />
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-700 px-1 text-[11px] font-bold text-white">
                      {quantity}
                    </span>
                  </div>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{product.name}</p>
                  <p className="text-sm tabular-nums text-slate-700">{formatMoney(line_total)}</p>
                </li>
              ))}
            </ul>
            <CartSummary cart={cart}>
              <Button type="submit" loading={placing} disabled={blocked} variant="dark" className="w-full py-3.5">
                <Icon name="lock" className="h-4 w-4" /> Payer {formatMoney(cart.total)}
              </Button>
              <p className="text-center text-xs text-slate-500">Aucun paiement réel ne sera effectué.</p>
            </CartSummary>
          </div>
        </aside>
      </form>
    </div>
  )
}
