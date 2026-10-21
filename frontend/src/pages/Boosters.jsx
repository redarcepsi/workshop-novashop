import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { shopApi } from '../api.js'
import BoosterOpening from '../components/BoosterOpening.jsx'
import BoosterPack from '../components/BoosterPack.jsx'
import Icon from '../components/Icon.jsx'
import { Alert, Button, ButtonLink, PD, PageSpinner, RarityBadge } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useWallet } from '../context/WalletContext.jsx'
import { RARITIES } from '../utils/cards.js'
import { formatChance, formatPD } from '../utils/format.js'

function Odds({ odds }) {
  return (
    <ul className="space-y-1.5">
      {[...odds].reverse().map((o) => (
        <li key={o.rarity} className="flex items-center gap-3 text-xs">
          <RarityBadge rarity={o.rarity} className="w-28 justify-center" />
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-violet-400 to-gold-300"
              style={{ width: `${Math.max(2, o.chance * 100)}%` }}
            />
          </span>
          <span className="w-14 text-right tabular-nums text-night-200">{formatChance(o.chance)}</span>
        </li>
      ))}
    </ul>
  )
}

function BoosterTile({ booster, onOpen }) {
  const { user } = useAuth()
  const { balance } = useWallet()
  const [showOdds, setShowOdds] = useState(false)
  const affordable = balance != null && balance >= booster.price
  const best = booster.odds.at(-1)

  return (
    <article className="panel group flex flex-col overflow-hidden">
      <div className="relative flex justify-center overflow-hidden px-8 pb-2 pt-8">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-3/4 opacity-40 blur-2xl"
          style={{ background: `radial-gradient(circle at 50% 30%, ${booster.colors[0]}, transparent 70%)` }}
        />
        <button
          type="button"
          onClick={() => onOpen(booster)}
          className="relative w-40 transition duration-300 group-hover:-translate-y-2 group-hover:rotate-2 sm:w-44"
          aria-label={`Ouvrir : ${booster.name}`}
        >
          <BoosterPack booster={booster} />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-6 pt-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-white">{booster.name}</h2>
          <PD amount={booster.price} className="shrink-0 text-lg text-gold-200" />
        </div>
        <p className="mt-2 flex-1 text-sm text-night-300">{booster.description}</p>

        <div className="mt-4 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
          <button
            type="button"
            onClick={() => setShowOdds((s) => !s)}
            aria-expanded={showOdds}
            className="flex w-full items-center justify-between gap-2 text-left text-xs text-night-200"
          >
            <span>
              Jusqu’à <strong className="text-white">{RARITIES[best.rarity].label.toLowerCase()}</strong> :{' '}
              {formatChance(best.chance)} par booster
            </span>
            <span className="flex items-center gap-1 font-semibold text-gold-300">
              Probabilités <Icon name="chevronDown" className={`h-4 w-4 transition ${showOdds ? 'rotate-180' : ''}`} />
            </span>
          </button>
          {showOdds && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <Odds odds={booster.odds} />
              <p className="mt-2 text-[11px] text-night-400">Chance d’obtenir au moins une carte de chaque rareté.</p>
            </div>
          )}
        </div>

        <div className="mt-5">
          {/* Solde encore inconnu : on laisse tenter, le serveur vérifie */}
          {!user || balance == null || affordable ? (
            <Button onClick={() => onOpen(booster)} className="w-full py-3">
              <Icon name="gift" className="h-5 w-5" /> Ouvrir · <PD amount={booster.price} />
            </Button>
          ) : (
            <ButtonLink to="/pokedollars" variant="secondary" className="w-full py-3">
              <Icon name="wallet" className="h-5 w-5" /> Il manque {formatPD(booster.price - (balance ?? 0))}
            </ButtonLink>
          )}
        </div>
      </div>
    </article>
  )
}

export default function Boosters() {
  const { user } = useAuth()
  const { balance } = useWallet()
  const navigate = useNavigate()
  const location = useLocation()
  const [boosters, setBoosters] = useState(null)
  const [error, setError] = useState('')
  const [opening, setOpening] = useState(null)

  useEffect(() => {
    shopApi
      .boosters()
      .then(setBoosters)
      .catch((e) => setError(e.message))
  }, [])

  const onOpen = (booster) => {
    if (!user) return navigate('/login', { state: { from: location } })
    setOpening(booster)
  }

  return (
    <div className="container-page py-10">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">Payés en PokéDollars</p>
          <h1 className="font-display text-5xl font-bold tracking-tight text-white">Les boosters</h1>
          <p className="mt-3 max-w-2xl text-night-300">
            Chaque booster contient une carte rare garantie. Les cartes sont tirées par nos serveurs au moment de
            l’ouverture et rejoignent aussitôt votre collection.
          </p>
        </div>
        {user ? (
          <div className="panel flex items-center gap-4 px-5 py-4">
            <div>
              <p className="text-xs text-night-400">Votre solde</p>
              <PD amount={balance ?? 0} className="text-2xl text-gold-100" />
            </div>
            <ButtonLink to="/pokedollars" variant="secondary" className="px-3">
              <Icon name="plus" className="h-4 w-4" /> Recharger
            </ButtonLink>
          </div>
        ) : (
          <p className="text-sm text-night-300">
            <Link to="/login" state={{ from: location }} className="font-semibold text-gold-300 hover:text-gold-200">
              Connectez-vous
            </Link>{' '}
            pour ouvrir des boosters.
          </p>
        )}
      </div>

      {error && <Alert>{error}</Alert>}
      {!boosters && !error && <PageSpinner />}

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {boosters?.map((b) => (
          <BoosterTile key={b.slug} booster={b} onOpen={onOpen} />
        ))}
      </div>

      {opening && <BoosterOpening booster={opening} onClose={() => setOpening(null)} />}
    </div>
  )
}
