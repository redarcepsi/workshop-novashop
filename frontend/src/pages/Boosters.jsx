import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { shopApi } from '../api.js'
import BoosterOpening from '../components/BoosterOpening.jsx'
import BoosterPack from '../components/BoosterPack.jsx'
import Icon from '../components/Icon.jsx'
import { Alert, Button, ButtonLink, PD, PageSpinner, RarityBadge } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useWallet } from '../context/WalletContext.jsx'
import { boosterSerie, groupBySerie, serieInfo } from '../utils/cards.js'
import { formatChance, formatOneIn, formatPD } from '../utils/format.js'

const BATCH = 5 // ouverture groupée (POST /boosters/{slug}/open-batch)

const serieAnchor =(serie) => `serie-${serie.normalize('NFD').replace(/[^a-zA-Z]+/g, '-').toLowerCase()}`

function Odds({ odds }) {
  // Les raretés présentes dans tous les boosters (communes…) n'apprennent rien : listées à part
  const always = odds.filter((o) => o.chance >= 1)
  const luck = [...odds].filter((o) => o.chance < 1).reverse()
  return (
    <>
      {/* Grille : badges et pourcentages alignés d'une ligne à l'autre, la barre prend la place restante */}
      <ul className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2.5 text-xs">
        {luck.map((o) => (
          <li key={o.rarity} className="contents">
            <RarityBadge rarity={o.rarity} className="justify-self-start whitespace-nowrap" />
            <span className="h-1.5 min-w-8 overflow-hidden rounded-full bg-white/10">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-violet-400 to-gold-300"
                style={{ width: `${Math.max(2, o.chance * 100)}%` }}
              />
            </span>
            <span className="text-right tabular-nums leading-tight text-night-200">
              {formatChance(o.chance)}
              {formatOneIn(o.chance) && (
                <span className="block whitespace-nowrap text-[10px] text-night-400">{formatOneIn(o.chance)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {always.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-night-400">
          Dans chaque booster :
          {always.map((o) => (
            <RarityBadge key={o.rarity} rarity={o.rarity} />
          ))}
        </p>
      )}
    </>
  )
}

function BoosterTile({ booster, onOpen }) {
  const { user } = useAuth()
  const { balance } = useWallet()
  const [showOdds, setShowOdds] = useState(false)
  const affordable = balance != null && balance >= booster.price
  const batchPrice = booster.price * BATCH
  const batchShort = Boolean(user) && balance != null && balance < batchPrice
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

      <div className="flex flex-1 flex-col p-5 pt-4 sm:p-6 sm:pt-4">
        {/* Titre sur toute la largeur, prix en dessous : rien ne se tasse quand la tuile est étroite */}
        <h2 className="font-display text-xl font-semibold leading-snug text-white">{booster.name}</h2>
        <p className="mt-1 flex items-center gap-2 text-sm">
          <PD amount={booster.price} className="text-base text-gold-200" />
          <span className="text-night-500" aria-hidden="true">·</span>
          <span className="text-night-400">{booster.card_count} cartes</span>
        </p>
        <p className="mt-3 flex-1 text-sm text-night-300">{booster.description}</p>

        <div className="mt-4 rounded-xl bg-white/5 ring-1 ring-white/10">
          <button
            type="button"
            onClick={() => setShowOdds((s) => !s)}
            aria-expanded={showOdds}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition hover:bg-white/5"
          >
            {/* Meilleure rareté possible et sa chance ; passe sur deux lignes plutôt que de déborder */}
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="sr-only">Meilleure rareté :</span>
              <RarityBadge rarity={best.rarity} className="whitespace-nowrap" />
              <span className="whitespace-nowrap text-night-200">
                {formatOneIn(best.chance) ?? `${formatChance(best.chance)} par booster`}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 font-semibold text-gold-300">
              Probabilités <Icon name="chevronDown" className={`h-4 w-4 transition ${showOdds ? 'rotate-180' : ''}`} />
            </span>
          </button>
          {showOdds && (
            <div className="mx-3 border-t border-white/10 py-3">
              <Odds odds={booster.odds} />
              <p className="mt-3 text-[11px] text-night-500">Chance d’obtenir au moins une carte de chaque rareté par booster.</p>
            </div>
          )}
        </div>

        <div className="mt-4">
          {/* Solde encore inconnu : on laisse tenter, le serveur vérifie */}
          {!user || balance == null || affordable ? (
            <div className="flex gap-2">
              <Button onClick={() => onOpen(booster)} className="h-11 min-w-0 flex-1 whitespace-nowrap">
                <Icon name="gift" className="h-5 w-5 shrink-0" /> Ouvrir
              </Button>
              <Button
                variant="secondary"
                onClick={() => onOpen(booster, BATCH)}
                disabled={batchShort}
                title={
                  batchShort
                    ? `Il manque ${formatPD(batchPrice - balance)} pour en ouvrir ${BATCH}`
                    : `Ouvrir ${BATCH} boosters d’un coup : ${formatPD(batchPrice)}`
                }
                className="h-11 shrink-0 whitespace-nowrap px-3.5"
              >
                × {BATCH}
                <PD amount={batchPrice} className="text-gold-200" />
              </Button>
            </div>
          ) : (
            <ButtonLink to="/pokedollars" variant="secondary" className="h-11 w-full whitespace-nowrap">
              <Icon name="wallet" className="h-5 w-5 shrink-0" /> Il manque
              <PD amount={booster.price - (balance ?? 0)} className="text-gold-200" />
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

  const groups = boosters ? groupBySerie(boosters, boosterSerie) : []

  const onOpen = (booster, count = 1) => {
    if (!user) return navigate('/login', { state: { from: location } })
    setOpening({ booster, count })
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

      {groups.length > 1 && (
        <nav aria-label="Séries" className="sticky top-16 z-20 -mx-4 mb-10 flex gap-2 overflow-x-auto bg-night-950/80 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-full sm:px-2 sm:ring-1 sm:ring-white/10">
          {groups.map(([serie, list]) => (
            <a
              key={serie}
              href={`#${serieAnchor(serie)}`}
              className="flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-night-200 transition hover:bg-white/10 hover:text-white"
            >
              {serieInfo(serie).label}
              <span className="rounded-full bg-white/10 px-1.5 text-[11px] text-night-300">{list.length}</span>
            </a>
          ))}
        </nav>
      )}

      <div className="space-y-14">
        {groups.map(([serie, list]) => (
          <section key={serie} id={serieAnchor(serie)} className="scroll-mt-36">
            <div className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-display text-3xl font-bold text-white">{serieInfo(serie).label}</h2>
              <span className="text-sm text-night-400">{serieInfo(serie).period}</span>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {list.map((b) => (
                <BoosterTile key={b.slug} booster={b} onOpen={onOpen} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {opening && <BoosterOpening booster={opening.booster} count={opening.count} onClose={() => setOpening(null)} />}
    </div>
  )
}
