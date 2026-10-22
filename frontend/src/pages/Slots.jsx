import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { shopApi } from '../api.js'
import { Burst } from '../components/BoosterOpening.jsx'
import Icon, { StarIcon } from '../components/Icon.jsx'
import { Emblem } from '../components/Logo.jsx'
import PokemonCard from '../components/PokemonCard.jsx'
import { Alert, Button, ButtonLink, Coin, PD, RarityBadge, Spinner } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useWallet } from '../context/WalletContext.jsx'
import { RARITIES, RARITY_ORDER, cardImage } from '../utils/cards.js'
import { formatChance, formatNumber, formatOneIn, plural } from '../utils/format.js'
import { uuid } from '../utils/uuid.js'

const PAGE = 24 // cartes chargées à la fois dans le sélecteur
const DURATIONS = [1300, 1850, 2400] // arrêt des rouleaux, de gauche à droite (ms)
const FILLER = [12, 18, 24] // symboles qui défilent avant le résultat, par rouleau
const SYMBOLS = ['card', 'coin', 'emblem', 'star', 'bolt', 'ball']
const OTHERS = SYMBOLS.filter((s) => s !== 'card')

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const pickOne = (list) => list[Math.floor(Math.random() * list.length)]

/**
 * Combinaison affichée pour une partie perdue (le résultat vient du serveur, seul le dessin est choisi ici) : une fois
 * sur trois, deux cartes et un symbole sur le dernier rouleau ; sinon trois symboles qui ne sont jamais identiques.
 */
function losingLine() {
  if (Math.random() < 1 / 3) return ['card', 'card', pickOne(OTHERS)]
  let line
  do {
    line = [pickOne(SYMBOLS), pickOne(SYMBOLS), pickOne(SYMBOLS)]
  } while (line[0] === line[1] && line[1] === line[2])
  return line
}

/** Bande d'un rouleau : part du symbole affiché, défile, s'arrête sur le symbole voulu. */
const buildStrip = (from, to, filler) => [from, ...Array.from({ length: filler }, () => pickOne(SYMBOLS)), to]

function PokeBall({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="#f8fafc" />
      <path d="M1.5 12a10.5 10.5 0 0 1 21 0Z" fill="#ef4444" />
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="#0f172a" strokeWidth="1.5" />
      <path d="M1.5 12h7m7 0h7" stroke="#0f172a" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3.2" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.5" />
    </svg>
  )
}

function CardSymbol({ card }) {
  const [failed, setFailed] = useState(false)
  if (!card || failed) return <Emblem className="h-1/2 w-1/2" />
  return (
    <img
      src={cardImage(card.image_url, 'low')}
      alt=""
      draggable="false"
      onError={() => setFailed(true)}
      className="h-[88%] rounded-[5%/3.5%] object-contain shadow-lg shadow-black/60"
    />
  )
}

function Symbol({ kind, card }) {
  const size = 'h-1/2 w-1/2'
  switch (kind) {
    case 'card':
      return <CardSymbol card={card} />
    case 'coin':
      return <Coin className={size} />
    case 'emblem':
      return <Emblem className={size} />
    case 'star':
      return <StarIcon className={`${size} text-gold-300 drop-shadow-[0_0_12px_rgba(255,194,28,0.6)]`} />
    case 'bolt':
      return <Icon name="bolt" strokeWidth={2} className={`${size} text-sky-300 drop-shadow-[0_0_12px_rgba(56,189,248,0.6)]`} />
    default:
      return <PokeBall className={size} />
  }
}

function Reel({ strip, spinId, duration, card, glow }) {
  return (
    <div
      className={`relative aspect-[63/88] overflow-hidden rounded-xl bg-gradient-to-b from-night-950 via-night-800 to-night-950 ring-1 ring-white/10 transition-shadow duration-500 ${glow ? 'reel-win' : ''}`}
      style={glow ? { '--glow': glow } : undefined}
    >
      {/* La bande mesure n symboles : la décaler de (n - 1) / n de sa hauteur montre le dernier */}
      <div
        key={spinId}
        className={spinId ? 'reel-strip' : ''}
        style={{ '--to': `${(-(strip.length - 1) / strip.length) * 100}%`, '--d': `${duration}ms` }}
      >
        {strip.map((kind, i) => (
          <div key={i} className="flex aspect-[63/88] items-center justify-center">
            <Symbol kind={kind} card={card} />
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/55" />
    </div>
  )
}

/** Mise, chance et coût moyen de chaque rareté ; la ligne de la carte choisie est mise en avant. */
function RulesTable({ rules, current }) {
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-night-400">
        <tr>
          <th className="pb-2 font-medium">Rareté</th>
          <th className="pb-2 text-right font-medium">Mise</th>
          <th className="pb-2 text-right font-medium">Chance</th>
          <th className="hidden pb-2 text-right font-medium sm:table-cell">Coût moyen</th>
        </tr>
      </thead>
      <tbody>
        {rules.map((r) => (
          <tr key={r.rarity} className={r.rarity === current ? 'bg-gold-400/10' : ''}>
            <td className="rounded-l-lg py-1.5 pl-1.5">
              <RarityBadge rarity={r.rarity} className="whitespace-nowrap" />
            </td>
            <td className="py-1.5 text-right">
              <PD amount={r.stake} className="text-gold-100" />
            </td>
            <td className="py-1.5 text-right tabular-nums text-night-100 max-sm:rounded-r-lg max-sm:pr-1.5">{formatChance(r.chance)}</td>
            <td className="hidden rounded-r-lg py-1.5 pr-1.5 text-right tabular-nums text-night-300 sm:table-cell">
              ≈ {formatNumber(Math.round(r.stake / r.chance))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** La machine : trois rouleaux, la carte visée, et le bouton pour jouer. */
function Machine({ product, rules, owned, onBusy, onSpun, machineRef }) {
  const { user } = useAuth()
  const { balance, setBalance } = useWallet()
  const navigate = useNavigate()
  const location = useLocation()
  const [reels, setReels] = useState({ id: 0, strips: [['ball'], ['card'], ['star']] })
  const [phase, setPhase] = useState('idle') // idle → waiting (requête) → spinning (rouleaux) → result
  const [result, setResult] = useState(null) // { spin, nearMiss }
  const [error, setError] = useState('')
  const [session, setSession] = useState({ spins: 0, staked: 0, won: 0 })
  // Une clé par partie : rejouée telle quelle après une erreur réseau, le serveur ne débite qu'une fois
  const requestId = useRef(uuid())

  const card = product?.card ?? null
  const rule = card ? rules?.find((r) => r.rarity === card.rarity) : null
  const glow = card ? RARITIES[card.rarity].glow ?? '#ffc21c' : '#ffc21c'
  const busy = phase === 'waiting' || phase === 'spinning'
  const short = Boolean(user && rule && balance != null && balance < rule.stake)

  // Pendant une partie, la carte visée ne change pas
  useEffect(() => {
    onBusy(busy)
  }, [busy, onBusy])

  // Nouvelle carte : nouvelle clé, et le résultat de la précédente s'efface
  useEffect(() => {
    requestId.current = uuid()
    setResult(null)
    setError('')
    setPhase((p) => (p === 'result' ? 'idle' : p))
  }, [card?.id])

  const spin = async () => {
    if (!user) return navigate('/login', { state: { from: { pathname: location.pathname + location.search } } })
    if (!card || busy) return
    setError('')
    setResult(null)
    setPhase('waiting')
    try {
      const res = await shopApi.spin(card.id, requestId.current)
      requestId.current = uuid()
      const line = res.won ? ['card', 'card', 'card'] : losingLine()
      const fast = reducedMotion()
      setPhase('spinning')
      setReels((prev) => ({
        id: prev.id + 1,
        strips: line.map((symbol, i) => buildStrip(prev.strips[i].at(-1), symbol, fast ? 0 : FILLER[i])),
      }))
      await wait(fast ? 50 : DURATIONS[2] + 200)
      setBalance(res.balance)
      setResult({ spin: res, nearMiss: !res.won && line[0] === 'card' && line[1] === 'card' })
      setSession((s) => ({ spins: s.spins + 1, staked: s.staked + res.stake, won: s.won + (res.won ? 1 : 0) }))
      setPhase('result')
      onSpun(res)
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  const won = phase === 'result' && result?.spin.won

  return (
    <section ref={machineRef} className="panel relative scroll-mt-32 overflow-hidden p-5 sm:p-8" aria-label="Machine à sous">
      <div
        className="pointer-events-none absolute inset-0 opacity-25 transition-colors duration-700"
        style={{ background: `radial-gradient(40rem 26rem at 35% 40%, ${glow}, transparent 70%)` }}
      />
      {won && card.rarity === 'SECRET' && <div className="screen-flash" style={{ '--flash': glow }} aria-hidden="true" />}

      <div className="relative grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ------------------------------------------------ le meuble et les rouleaux */}
        <div>
          <div className="mx-auto max-w-lg rounded-[2rem] bg-gradient-to-b from-gold-200 via-gold-500 to-gold-700 p-[3px] shadow-2xl shadow-gold-500/20">
            <div className={`rounded-[calc(2rem-3px)] bg-night-950 p-4 sm:p-6 ${busy ? 'is-spinning' : ''}`}>
              <p className="text-center font-display text-3xl font-bold tracking-[0.3em] sm:text-4xl">
                <span className="text-bling">JACKPOT</span>
              </p>
              <div className="mt-2 flex justify-center gap-2.5" aria-hidden="true">
                {Array.from({ length: 11 }, (_, i) => (
                  <span
                    key={i}
                    className={`slot-light h-1.5 w-1.5 rounded-full ${i % 2 ? 'text-gold-300' : 'text-fuchsia-300'} bg-current`}
                    style={{ animationDelay: `${(i % 3) * 0.2}s` }}
                  />
                ))}
              </div>

              <div className="relative mt-4 rounded-2xl bg-night-900 p-2 ring-1 ring-white/10 sm:p-3">
                {won && <Burst key={result.spin.id} color={glow} />}
                <div className="relative z-10 grid grid-cols-3 gap-2 sm:gap-3">
                  {reels.strips.map((strip, i) => (
                    <Reel
                      key={i}
                      strip={strip}
                      spinId={reels.id}
                      duration={reducedMotion() ? 1 : DURATIONS[i]}
                      card={card}
                      glow={won ? glow : null}
                    />
                  ))}
                </div>
                {/* Ligne de paiement */}
                <span className="absolute -left-1.5 top-1/2 z-10 h-0 w-0 -translate-y-1/2 border-y-[7px] border-l-[9px] border-y-transparent border-l-gold-300" aria-hidden="true" />
                <span className="absolute -right-1.5 top-1/2 z-10 h-0 w-0 -translate-y-1/2 border-y-[7px] border-r-[9px] border-y-transparent border-r-gold-300" aria-hidden="true" />
              </div>

              {/* Résultat */}
              <div className="mt-5 flex min-h-[3.5rem] flex-col items-center justify-center text-center" aria-live="polite">
                {phase === 'result' && result ? (
                  result.spin.won ? (
                    <div key={result.spin.id} className="animate-pop-in">
                      <p className="font-display text-2xl font-bold text-white">
                        <span className="text-bling">Gagné !</span> {result.spin.card.name} est à vous
                      </p>
                      <p className="mt-1 flex items-center justify-center gap-2 text-sm text-night-300">
                        {result.spin.is_new && (
                          <span className="rounded-full bg-gold-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-night-950">Nouvelle</span>
                        )}
                        Elle rejoint votre collection.
                      </p>
                    </div>
                  ) : (
                    <div key={result.spin.id} className="animate-pop-in">
                      <p className="font-display text-xl font-semibold text-white">{result.nearMiss ? 'Si près du but…' : 'Perdu, pas cette fois !'}</p>
                      <p className="mt-1 text-sm text-night-400">La chance tourne : retentez votre chance.</p>
                    </div>
                  )
                ) : busy ? (
                  <p className="animate-pulse font-display text-xl font-semibold text-gold-200">Les rouleaux tournent…</p>
                ) : card ? (
                  <p className="text-sm text-night-300">
                    Trois <strong className="text-white">{card.name}</strong> alignés, et la carte est à vous.
                  </p>
                ) : (
                  <p className="text-sm text-night-300">Choisissez une carte ci-dessous pour lancer la machine.</p>
                )}
              </div>

              {error && (
                <div className="mt-3">
                  <Alert>{error}</Alert>
                </div>
              )}

              {/* Commandes */}
              <div className="mt-4">
                {short ? (
                  <ButtonLink to="/pokedollars" variant="secondary" className="h-12 w-full whitespace-nowrap">
                    <Icon name="wallet" className="h-5 w-5 shrink-0" /> Il manque
                    <PD amount={rule.stake - balance} className="text-gold-200" />
                  </ButtonLink>
                ) : (
                  <Button onClick={spin} disabled={!card || !rule || busy} className="h-12 w-full text-base">
                    {busy ? (
                      <>
                        <Spinner className="h-5 w-5" /> Bonne chance…
                      </>
                    ) : !card ? (
                      'Choisissez une carte'
                    ) : !user ? (
                      <>
                        <Icon name="user" className="h-5 w-5" /> Se connecter pour jouer
                      </>
                    ) : (
                      <>
                        <Icon name="sparkles" className="h-5 w-5" /> {phase === 'result' ? 'Rejouer' : 'Jouer'}
                        {rule && <PD amount={rule.stake} className="text-night-950" />}
                      </>
                    )}
                  </Button>
                )}
              </div>
              {session.spins > 0 && (
                <p className="mt-3 text-center text-xs text-night-400">
                  Cette visite : {plural(session.spins, 'partie')} · {formatNumber(session.staked)} PokéDollars misés ·{' '}
                  {plural(session.won, 'carte gagnée', 'cartes gagnées')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------ la carte visée et les règles */}
        <aside className="space-y-6">
          {card ? (
            <div className="flex gap-4">
              <Link to={`/cards/${product.slug}`} className="w-24 shrink-0" title="Voir la fiche de la carte">
                <PokemonCard card={card} quality="high" />
              </Link>
              <div className="min-w-0">
                <p className="text-xs text-night-400">Carte visée</p>
                <p className="truncate font-display text-xl font-semibold text-white">{card.name}</p>
                <p className="truncate text-xs text-night-400">
                  {card.set.name} · n° {card.number}
                </p>
                <RarityBadge rarity={card.rarity} label={card.rarity_label} className="mt-2" />
                {rule && (
                  <p className="mt-2 text-xs text-night-300">
                    <PD amount={rule.stake} className="text-gold-100" /> la partie · {formatChance(rule.chance)} de chance
                    {formatOneIn(rule.chance, 'partie') && <span className="text-night-400"> ({formatOneIn(rule.chance, 'partie')})</span>}
                  </p>
                )}
                {owned > 0 && <p className="mt-1.5 text-xs font-semibold text-emerald-300">✓ Déjà × {owned} dans votre collection</p>}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-4 text-sm text-night-300 ring-1 ring-white/10">
              <Icon name="cards" className="h-6 w-6 shrink-0 text-gold-300" />
              Toutes les cartes du catalogue peuvent se gagner, même celles en rupture de stock.
            </div>
          )}

          {rules && (
            <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
              <p className="mb-3 text-sm font-semibold text-white">Mise et chance selon la rareté</p>
              <RulesTable rules={rules} current={card?.rarity} />
              <p className="mt-3 text-[11px] leading-relaxed text-night-500">
                Résultat tiré par nos serveurs à chaque partie. Coût moyen : mise ÷ chance, en PokéDollars, pour gagner
                la carte.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

/** Toutes les cartes du catalogue : recherche, set et rareté. */
function CardPicker({ selected, rules, owned, disabled, onSelect }) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ q: '', set: '', rarity: '' })
  const [sets, setSets] = useState([])
  const [page, setPage] = useState({ items: [], total: 0, loading: true, error: '' })

  useEffect(() => {
    shopApi.sets().then(setSets).catch(() => {})
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.q === query.trim() ? f : { ...f, q: query.trim() })), 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let cancelled = false
    setPage((p) => ({ ...p, loading: true, error: '' }))
    shopApi
      .products({ kind: 'CARD', ...filters, sort: 'featured', limit: PAGE })
      .then((r) => !cancelled && setPage({ items: r.items, total: r.total, loading: false, error: '' }))
      .catch((e) => !cancelled && setPage({ items: [], total: 0, loading: false, error: e.message }))
    return () => {
      cancelled = true
    }
  }, [filters])

  const more = () => {
    setPage((p) => ({ ...p, loading: true }))
    shopApi
      .products({ kind: 'CARD', ...filters, sort: 'featured', limit: PAGE, offset: page.items.length })
      .then((r) => setPage((p) => ({ items: [...p.items, ...r.items], total: r.total, loading: false, error: '' })))
      .catch((e) => setPage((p) => ({ ...p, loading: false, error: e.message })))
  }

  const stakeOf = (rarity) => rules?.find((r) => r.rarity === rarity)?.stake
  const chip = (active) =>
    `shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
      active ? 'bg-gold-400 text-night-950 ring-gold-400' : 'bg-white/5 text-night-200 ring-white/10 hover:bg-white/10'
    }`

  return (
    <section className="mt-14" aria-labelledby="picker-title">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="picker-title" className="font-display text-3xl font-bold tracking-tight text-white">
            Choisissez votre carte
          </h2>
          <p className="mt-1 text-sm text-night-300">{plural(page.total, 'carte')} · plus elle est rare, plus la mise monte et la chance baisse.</p>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative md:w-72">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-night-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Dracaufeu, Pikachu, Évoli…"
            aria-label="Rechercher une carte"
            className="input pl-10"
          />
        </div>
        <select
          value={filters.set}
          onChange={(e) => setFilters((f) => ({ ...f, set: e.target.value }))}
          aria-label="Set"
          className="input md:w-56"
        >
          <option value="">Tous les sets</option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 md:pb-0" role="group" aria-label="Rareté">
          <button type="button" onClick={() => setFilters((f) => ({ ...f, rarity: '' }))} className={chip(!filters.rarity)}>
            Toutes
          </button>
          {[...RARITY_ORDER].reverse().map((r) => (
            <button key={r} type="button" onClick={() => setFilters((f) => ({ ...f, rarity: r }))} className={chip(filters.rarity === r)}>
              {RARITIES[r].symbol} {RARITIES[r].label}
            </button>
          ))}
        </div>
      </div>

      {page.error && <Alert>{page.error}</Alert>}
      {!page.loading && !page.error && page.items.length === 0 && (
        <p className="py-12 text-center text-sm text-night-400">Aucune carte ne correspond à cette recherche.</p>
      )}

      <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {page.items.map((p) => {
          const active = selected?.card.id === p.card.id
          const stake = stakeOf(p.card.rarity)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              disabled={disabled}
              aria-pressed={active}
              title={`${p.card.name} — ${p.card.set.name}`}
              className="group text-left disabled:cursor-wait"
            >
              <div
                className={`relative rounded-[6%/4.5%] transition duration-200 group-hover:-translate-y-1 ${
                  active ? 'ring-2 ring-gold-300 ring-offset-4 ring-offset-night-950' : ''
                }`}
              >
                <PokemonCard card={p.card} interactive={false} />
                {owned.get(p.card.id) > 0 && (
                  <span className="absolute right-1 top-1 rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white shadow" title="Dans votre collection">
                    ✓
                  </span>
                )}
              </div>
              <p className="mt-2 truncate text-xs font-medium text-night-100">{p.card.name}</p>
              {stake != null && <PD amount={stake} className="text-[11px] text-gold-200" />}
            </button>
          )
        })}
      </div>

      {page.loading && (
        <div className="flex justify-center py-10 text-gold-400">
          <Spinner className="h-7 w-7" />
        </div>
      )}
      {!page.loading && page.items.length < page.total && (
        <div className="mt-8 flex justify-center">
          <Button variant="secondary" onClick={more}>
            Voir plus de cartes ({formatNumber(page.total - page.items.length)} restantes)
          </Button>
        </div>
      )}
    </section>
  )
}

export default function Slots() {
  const { user } = useAuth()
  const { balance } = useWallet()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [rules, setRules] = useState(null)
  const [selected, setSelected] = useState(null) // le produit de la carte visée
  const [owned, setOwned] = useState(() => new Map()) // id de carte → exemplaires possédés
  const [spinning, setSpinning] = useState(false)
  const machineRef = useRef(null)
  const slug = params.get('card')

  useEffect(() => {
    shopApi.slotRules().then(setRules).catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) return setOwned(new Map())
    shopApi
      .collection()
      .then((c) => setOwned(new Map(c.items.map((i) => [i.card.id, i.quantity]))))
      .catch(() => {})
  }, [user])

  // Lien direct (/slots?card=<slug>, depuis la fiche d'une carte)
  useEffect(() => {
    if (!slug || slug === selected?.slug) return
    shopApi
      .product(slug)
      .then((p) => p.kind === 'CARD' && setSelected(p))
      .catch(() => {})
  }, [slug, selected?.slug])

  const onSelect = (product) => {
    setSelected(product)
    setParams({ card: product.slug }, { replace: true })
    machineRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }

  const onSpun = (spin) => {
    if (spin.won) setOwned((m) => new Map(m).set(spin.card.id, (m.get(spin.card.id) ?? 0) + 1))
  }

  return (
    <div className="container-page py-10">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">Payée en PokéDollars</p>
          <h1 className="font-display text-5xl font-bold tracking-tight text-white">La machine à sous</h1>
          <p className="mt-3 max-w-2xl text-night-300">
            Visez n’importe quelle carte, misez vos PokéDollars et alignez-la trois fois pour la gagner. Plus la carte est
            rare, plus la mise est élevée et la chance faible.
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
            <Link
              to="/login"
              state={{ from: { pathname: location.pathname + location.search } }}
              className="font-semibold text-gold-300 hover:text-gold-200"
            >
              Connectez-vous
            </Link>{' '}
            pour jouer.
          </p>
        )}
      </div>

      <Machine
        product={selected}
        rules={rules}
        owned={selected ? owned.get(selected.card.id) ?? 0 : 0}
        onBusy={setSpinning}
        onSpun={onSpun}
        machineRef={machineRef}
      />
      <CardPicker selected={selected} rules={rules} owned={owned} disabled={spinning} onSelect={onSelect} />
    </div>
  )
}
