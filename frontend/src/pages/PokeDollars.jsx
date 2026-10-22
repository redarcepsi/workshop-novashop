import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { shopApi } from '../api.js'
import Icon from '../components/Icon.jsx'
import { CoinPile, PokeDollarPack } from '../components/ProductCard.jsx'
import { Alert, ButtonLink, PD, PageSpinner } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useWallet } from '../context/WalletContext.jsx'
import { formatDateTime, formatNumber } from '../utils/format.js'

const REASONS = {
  PURCHASE: { icon: 'bag', label: 'Achat' },
  BOOSTER: { icon: 'gift', label: 'Booster' },
  REFUND: { icon: 'refresh', label: 'Annulation' },
  SLOT: { icon: 'sparkles', label: 'Machine à sous' },
}
const OTHER_REASON = { icon: 'wallet', label: 'Mouvement' }

function History() {
  const { entries, refresh } = useWallet()

  useEffect(() => {
    refresh()
  }, [refresh])

  if (entries.length === 0) {
    return <p className="py-8 text-center text-sm text-night-400">Aucun mouvement pour l’instant.</p>
  }
  return (
    <ul className="divide-y divide-white/10">
      {entries.map((e) => {
        const reason = REASONS[e.reason] ?? OTHER_REASON
        const isOrder = e.reference.startsWith('CMD-')
        return (
          <li key={`${e.created_at}-${e.reference}-${e.amount}`} className="flex items-center gap-4 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-night-200 ring-1 ring-white/10">
              <Icon name={reason.icon} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{e.label}</p>
              <p className="text-xs text-night-400">
                {reason.label} · {formatDateTime(e.created_at)}
                {isOrder && e.reason === 'PURCHASE' && (
                  <>
                    {' '}·{' '}
                    <Link to="/orders" className="text-gold-300 hover:text-gold-200">
                      voir mes commandes
                    </Link>
                  </>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className={`font-semibold tabular-nums ${e.amount > 0 ? 'text-emerald-300' : 'text-night-100'}`}>
                {e.amount > 0 ? '+' : '−'}
                {formatNumber(Math.abs(e.amount))}
              </p>
              <p className="text-xs tabular-nums text-night-500">solde {formatNumber(e.balance_after)}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default function PokeDollars() {
  const { user } = useAuth()
  const { balance } = useWallet()
  const [packs, setPacks] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    shopApi
      .products({ kind: 'POKEDOLLARS', sort: 'price_asc' })
      .then((r) => setPacks(r.items))
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div className="container-page py-10">
      <div className="relative mb-12 overflow-hidden rounded-3xl border border-gold-300/20 bg-gradient-to-br from-night-800 via-night-900 to-night-950 p-8 sm:p-12">
        <div className="pointer-events-none absolute -right-10 -top-24 h-96 w-96 rounded-full bg-gold-400/20 blur-3xl" />
        <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">La monnaie PokéBling</p>
            <h1 className="font-display text-5xl font-bold tracking-tight text-white">PokéDollars</h1>
            <p className="mt-3 max-w-xl text-night-300">
              Achetés par carte bancaire, crédités dès le paiement, ils servent à ouvrir les boosters et à jouer à la
              machine à sous. Comptez environ
              100 PokéDollars par euro, et jusqu’à 40 % offerts sur les gros lots.
            </p>
            {user ? (
              <div className="mt-6 inline-flex items-center gap-4 rounded-2xl bg-white/5 px-5 py-4 ring-1 ring-white/10">
                <div>
                  <p className="text-xs text-night-400">Votre solde</p>
                  <PD amount={balance ?? 0} className="text-3xl text-gold-100" />
                </div>
                <ButtonLink to="/boosters" variant="secondary">
                  <Icon name="gift" className="h-4 w-4" /> Ouvrir un booster
                </ButtonLink>
              </div>
            ) : (
              <p className="mt-6 text-sm text-night-300">
                <Link to="/login" state={{ from: { pathname: '/pokedollars' } }} className="font-semibold text-gold-300 hover:text-gold-200">
                  Connectez-vous
                </Link>{' '}
                pour voir votre solde. Vous pouvez déjà remplir votre panier.
              </p>
            )}
          </div>
          <CoinPile level={4} className="hidden aspect-square w-56 md:block" />
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {!packs && !error && <PageSpinner />}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {packs?.map((p, i) => (
          <PokeDollarPack key={p.id} product={p} level={i + 1} />
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-night-400">
        Paiement par carte via notre plateforme de paiement · aucun paiement réel · annulation possible tant que les
        PokéDollars n’ont pas été dépensés.
      </p>

      {user && (
        <section className="panel mx-auto mt-16 max-w-3xl p-6">
          <h2 className="font-display text-2xl font-semibold text-white">Historique</h2>
          <History />
        </section>
      )}
    </div>
  )
}
