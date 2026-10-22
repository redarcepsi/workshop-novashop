import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { shopApi } from '../api.js'
import BoosterPack from '../components/BoosterPack.jsx'
import Icon from '../components/Icon.jsx'
import PokemonCard from '../components/PokemonCard.jsx'
import { Alert, ButtonLink, EmptyState, PD, PageSpinner } from '../components/ui.jsx'
import { RARITIES, RARITY_ORDER, byRarity, groupBySerie, serieInfo, setLogo } from '../utils/cards.js'
import { formatDate, formatMoney, formatNumber, plural } from '../utils/format.js'

const SHOW = [
  { value: 'all', label: 'Toutes' },
  { value: 'owned', label: 'Possédées' },
  { value: 'missing', label: 'Manquantes' },
]

const SORTS = {
  rarity: { label: 'Par rareté', compare: byRarity },
  number: { label: 'Par numéro', compare: (a, b) => a.number - b.number },
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="flex rounded-full bg-white/5 p-1 ring-1 ring-white/10">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            value === o.value ? 'bg-white text-night-950' : 'text-night-300 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ProgressRing({ value, size = 104 }) {
  const r = 44
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox="0 0 104 104" className="-rotate-90" aria-hidden="true">
      <circle cx="52" cy="52" r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="10" />
      <circle
        cx="52"
        cy="52"
        r={r}
        fill="none"
        stroke="url(#ring)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`}
        className="transition-[stroke-dasharray] duration-700"
      />
      <defs>
        <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#ffc21c" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function Stat({ label, value, hint }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-night-400">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold text-white">{value}</p>
      {hint && <p className="text-xs text-night-400">{hint}</p>}
    </div>
  )
}

// Totaux toujours visibles ; le détail par booster est replié par défaut
function OpenedBoosters({ boosters }) {
  const [open, setOpen] = useState(false)
  const opened = boosters.reduce((n, b) => n + b.opened, 0)
  const spent = boosters.reduce((n, b) => n + b.spent, 0)

  return (
    <section className="panel mt-6">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="opened-boosters"
          className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-2xl p-6 text-left transition hover:bg-white/[0.03] sm:px-8"
        >
          <span>
            <span className="block font-display text-2xl font-bold text-white">Mes boosters</span>
            <span className="mt-1 block text-sm text-night-300">
              {plural(opened, 'booster ouvert', 'boosters ouverts')} · <PD amount={spent} className="text-gold-200" /> dépensés
            </span>
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold text-gold-300">
            {open ? 'Masquer le détail' : 'Voir le détail'}
            <Icon name="chevronDown" className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>
      </h2>
      {open && (
        <div id="opened-boosters" className="grid grid-cols-3 gap-4 border-t border-white/10 p-6 sm:grid-cols-4 sm:p-8 md:grid-cols-6 lg:grid-cols-8">
          {boosters.map((b) => (
            <Link
              key={b.slug}
              to="/boosters"
              className="group text-center"
              title={`${b.name} — dernier ouvert le ${formatDate(b.last_opened_at)}`}
            >
              <div className="relative">
                <BoosterPack booster={b} className="transition duration-300 group-hover:-translate-y-1 group-hover:rotate-2" />
                <span className="absolute -right-1.5 -top-1.5 z-10 rounded-full bg-gold-400 px-2 py-0.5 text-xs font-bold text-night-950 shadow">
                  × {formatNumber(b.opened)}
                </span>
              </div>
              <p className="mt-3 truncate text-sm font-semibold text-white">{b.name.replace('Booster ', '')}</p>
              <PD amount={b.spent} className="mt-0.5 text-xs text-night-300" />
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

export default function Collection() {
  const [collection, setCollection] = useState(null)
  const [error, setError] = useState('')
  const [setId, setSetId] = useState(null)
  const [setCards, setSetCards] = useState(null)
  const [show, setShow] = useState('all')
  const [rarity, setRarity] = useState('')
  const [sort, setSort] = useState('rarity')

  useEffect(() => {
    shopApi
      .collection()
      .then((c) => {
        setCollection(c)
        // Ouvre le set le plus avancé
        const best = [...c.sets].sort((a, b) => b.owned / b.total - a.owned / a.total)[0]
        setSetId(best?.id ?? null)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!setId) return
    let cancelled = false
    setSetCards(null)
    shopApi
      .setCards(setId)
      .then((cards) => !cancelled && setSetCards(cards))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [setId])

  const owned = useMemo(() => new Map(collection?.items.map((i) => [i.card.id, i.quantity]) ?? []), [collection])

  if (error) {
    return (
      <div className="container-page py-10">
        <Alert>{error}</Alert>
      </div>
    )
  }
  if (!collection) return <PageSpinner />

  if (collection.distinct === 0) {
    return (
      <div className="container-page py-10">
        <EmptyState
          icon="grid"
          title="Votre collection est vide"
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink to="/boosters">
                <Icon name="gift" className="h-4 w-4" /> Ouvrir un booster
              </ButtonLink>
              <ButtonLink to="/cards" variant="secondary">
                Acheter des cartes
              </ButtonLink>
            </div>
          }
        >
          Ouvrez votre premier booster ou achetez une carte à l’unité : elle apparaîtra ici aussitôt.
        </EmptyState>
      </div>
    )
  }

  const progress = collection.distinct / collection.total
  const currentSet = collection.sets.find((s) => s.id === setId)
  const visible = (setCards ?? [])
    .filter((card) => {
      const has = owned.has(card.id)
      if (show === 'owned' && !has) return false
      if (show === 'missing' && has) return false
      return !rarity || card.rarity === rarity
    })
    .sort(SORTS[sort].compare)

  return (
    <div className="container-page py-10">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">Mon classeur</p>
      <h1 className="font-display text-5xl font-bold tracking-tight text-white">Ma collection</h1>

      <div className="panel mt-8 grid gap-8 p-6 sm:p-8 md:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-5">
          <div className="relative">
            <ProgressRing value={progress} />
            <span className="absolute inset-0 flex items-center justify-center font-display text-xl font-bold text-white">
              {Math.floor(progress * 100)} %
            </span>
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-white">
              {formatNumber(collection.distinct)} <span className="text-night-400">/ {formatNumber(collection.total)}</span>
            </p>
            <p className="text-sm text-night-300">cartes différentes</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:border-l md:border-white/10 md:pl-8">
          <Stat label="Exemplaires" value={formatNumber(collection.copies)} hint="doublons compris" />
          <Stat label="Valeur estimée" value={<span className="text-bling">{formatMoney(collection.value)}</span>} hint="au prix de la boutique" />
          <Stat
            label="Plus belle carte"
            value={
              <span className="text-xl">
                {RARITIES[collection.items.reduce((a, b) => (RARITY_ORDER.indexOf(b.card.rarity) > RARITY_ORDER.indexOf(a) ? b.card.rarity : a), 'COMMON')].label}
              </span>
            }
          />
        </div>
      </div>

      {collection.boosters.length > 0 && <OpenedBoosters boosters={collection.boosters} />}

      {/* Avancement par set, série par série */}
      <div className="mt-8 space-y-6">
        {groupBySerie(collection.sets).map(([serie, sets]) => (
          <div key={serie}>
            <p className="mb-3 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-night-300">
              {serieInfo(serie).label}
              <span className="font-normal normal-case tracking-normal text-night-500">
                {sets.reduce((n, s) => n + s.owned, 0)} / {sets.reduce((n, s) => n + s.total, 0)}
              </span>
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {sets.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSetId(s.id)}
                  aria-pressed={s.id === setId}
                  className={`rounded-2xl border p-3.5 text-left transition ${
                    s.id === setId ? 'border-gold-300/60 bg-gold-400/10' : 'border-white/10 bg-night-900/60 hover:border-white/20'
                  }`}
                >
                  <div className="flex h-9 items-center">
                    {s.logo_url ? <img src={setLogo(s.logo_url)} alt="" loading="lazy" className="max-h-full max-w-[7rem] object-contain" /> : <Icon name="cards" />}
                  </div>
                  <p className="mt-2.5 truncate text-sm font-semibold text-white">{s.name}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-gold-300" style={{ width: `${(s.owned / s.total) * 100}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs tabular-nums text-night-400">
                    {s.owned} / {s.total}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {currentSet && (
        <section className="mt-10">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display text-3xl font-bold text-white">{currentSet.name}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented options={SHOW} value={show} onChange={setShow} />
              <Segmented
                options={Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label }))}
                value={sort}
                onChange={setSort}
              />
              <select
                value={rarity}
                onChange={(e) => setRarity(e.target.value)}
                aria-label="Filtrer par rareté"
                className="rounded-full border border-white/10 bg-night-900 py-1.5 pl-3 pr-2 text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-gold-400/30"
              >
                <option value="">Toutes les raretés</option>
                {RARITY_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {RARITIES[r].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!setCards ? (
            <PageSpinner />
          ) : visible.length === 0 ? (
            <p className="py-12 text-center text-sm text-night-400">Aucune carte ne correspond à ces filtres.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-6 xl:grid-cols-8">
              {visible.map((card) => {
                const quantity = owned.get(card.id)
                return (
                  <Link
                    key={card.id}
                    to={`/cards/${card.slug}`}
                    className="group relative"
                    title={quantity ? `${card.name} — × ${quantity}` : `${card.name} — manquante, l’acheter à l’unité`}
                  >
                    <PokemonCard card={card} dimmed={!quantity} interactive={Boolean(quantity)} />
                    {quantity > 1 && (
                      <span className="absolute -right-1.5 -top-1.5 z-10 rounded-full bg-gold-400 px-1.5 py-0.5 text-[11px] font-bold text-night-950 shadow">
                        × {quantity}
                      </span>
                    )}
                    {!quantity && (
                      <span className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 text-center opacity-0 transition group-hover:opacity-100">
                        <span className="rounded-full bg-night-950/90 px-2 py-1 text-[11px] font-semibold text-white ring-1 ring-white/20">
                          n° {card.number} · Acheter
                        </span>
                      </span>
                    )}
                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      <span className={`truncate text-[11px] ${quantity ? 'text-night-100' : 'text-night-500'}`}>{card.name}</span>
                      <span className="shrink-0 text-[10px] text-night-500">{RARITIES[card.rarity].symbol}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      )}

      {collection.items.length > 0 && (
        <p className="mt-10 text-center text-xs text-night-500">
          Les cartes grisées vous manquent : cliquez pour les acheter à l’unité, ou tentez votre chance dans un{' '}
          <Link to="/boosters" className="text-gold-300 hover:text-gold-200">
            booster
          </Link>
          .
        </p>
      )}
    </div>
  )
}
