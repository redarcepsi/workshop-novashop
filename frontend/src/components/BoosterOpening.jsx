import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shopApi } from '../api.js'
import { useWallet } from '../context/WalletContext.jsx'
import { RARITIES, rarityRank } from '../utils/cards.js'
import { plural } from '../utils/format.js'
import { uuid } from '../utils/uuid.js'
import BoosterPack from './BoosterPack.jsx'
import Icon from './Icon.jsx'
import PokemonCard, { CardBack } from './PokemonCard.jsx'
import { Alert, Button, ButtonLink, PD, RarityBadge } from './ui.jsx'

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

const CHARGE_MS = 900 // le paquet se charge pendant le tirage (durée minimale)
const TEAR_MS = 1300 // bande arrachée, lumière, chute du paquet
const SUSPENSE_MS = { HOLO: 650, ULTRA: 1000, SECRET: 1400 } // montée en tension avant une carte rare
const CUT_TO_OPEN = 0.6 // part de la ligne de découpe à parcourir du doigt pour ouvrir

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clamp = (v) => Math.max(0, Math.min(1, v))
const glowOf = (card) => RARITIES[card.rarity].glow

// Étincelles de l'éclat (angle, distance, délai) et désordre de la pile : identiques à chaque ouverture
const PARTICLES = Array.from({ length: 18 }, (_, i) => ({ a: i * 20 + ((i * 7) % 9), d: 110 + ((i * 37) % 90), delay: (i % 3) * 60 }))
const jitter = (i) => (((i * 47) % 9) - 4) * 0.7

export function Burst({ color }) {
  return (
    <div className="burst" style={{ '--glow': color }} aria-hidden="true">
      <div className="burst-rays" />
      <div className="burst-ring" />
      {PARTICLES.map((p, i) => (
        <span key={i} className="burst-particle" style={{ '--a': `${p.a}deg`, '--d': `${p.d}px`, animationDelay: `${p.delay}ms` }} />
      ))}
    </div>
  )
}

/**
 * Le paquet : il suit le pointeur, s'ouvre d'un geste le long de la ligne de découpe ou d'une simple touche.
 * `behind` : paquets encore à ouvrir (ouverture groupée), empilés derrière lui.
 */
function Pack({ booster, phase, onOpen, behind = 0 }) {
  const ref = useRef(null)
  const drag = useRef(null)
  const suppressClick = useRef(false)
  const [cut, setCut] = useState(0)
  const [tilt, setTilt] = useState([0, 0])
  const ready = phase === 'ready'

  const onPointerDown = (e) => {
    if (!ready) return
    drag.current = { x: e.clientX, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!ready) return
    const rect = ref.current.getBoundingClientRect()
    setTilt([((e.clientY - rect.top) / rect.height - 0.5) * -14, ((e.clientX - rect.left) / rect.width - 0.5) * 18])
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    if (Math.abs(dx) > 8) drag.current.moved = true
    const progress = clamp(dx / (rect.width * 0.9))
    setCut(progress)
    if (progress >= CUT_TO_OPEN) {
      drag.current = null
      setCut(1)
      onOpen()
    }
  }
  const endDrag = () => {
    if (drag.current?.moved) suppressClick.current = true // geste inachevé : ce n'est pas une touche
    drag.current = null
    if (ready) setCut(0)
  }
  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (ready) onOpen()
  }

  const stage = ready ? 'ready' : phase === 'opening' ? 'charging' : 'torn'
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => ready && setTilt([0, 0])}
      disabled={!ready}
      aria-label="Ouvrir le booster"
      className={`pack-stage relative w-56 touch-none sm:w-64 ${ready ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {Array.from({ length: Math.min(behind, 4) }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 transition-transform duration-500"
          style={{ transform: `translate(${(i + 1) * 12}px, ${(i + 1) * -8}px) rotate(${(i + 1) * 3}deg)`, filter: `brightness(${0.75 - i * 0.1})` }}
        >
          <BoosterPack booster={booster} className="w-full" />
        </div>
      ))}
      <div className={ready ? 'animate-float' : phase === 'opening' ? 'pack-charging' : 'pack-drop'}>
        <div className="pack-tilt" style={{ '--tx': `${tilt[0]}deg`, '--ty': `${tilt[1]}deg` }}>
          <BoosterPack booster={booster} stage={stage} cut={cut} className="w-full drop-shadow-[0_30px_40px_rgba(0,0,0,0.55)]" />
        </div>
      </div>
    </button>
  )
}

/**
 * Ouverture d'un booster en plein écran. Le client découpe le haut du paquet (ou le touche) ; le paquet se charge
 * pendant que le serveur tire les cartes, se déchire, et les cartes sortent en pile, face cachée. Chaque touche
 * retourne la carte suivante (la plus rare en dernier) ; avant une carte holo ou mieux, la pile tremble aux couleurs
 * de sa rareté. Un récapitulatif termine l'ouverture.
 *
 * `count` > 1 : ouverture groupée. Tous les boosters sont payés et tirés en une requête ; le client les déchire
 * ensuite l'un après l'autre, puis un récapitulatif rassemble toutes les cartes.
 *
 * `daily` : le booster du jour, offert (POST /boosters/daily) ; un seul, et pas de « rouvrir » à la fin.
 */
export default function BoosterOpening({ booster, count = 1, daily = false, onClose }) {
  const { balance, setBalance } = useWallet()
  const [phase, setPhase] = useState('ready') // ready → opening → tearing → reveal → (ready…) → summary (ou error)
  // Une clé par ouverture : rejouée telle quelle après une erreur réseau, le serveur ne débite qu'une fois
  const [requestId, setRequestId] = useState(() => uuid())
  const [batch, setBatch] = useState(null) // { openings, balance } : réponse du serveur
  const [current, setCurrent] = useState(0) // booster en cours, dans le lot
  const [step, setStep] = useState(0) // cartes retournées
  const [cleared, setCleared] = useState(0) // cartes déjà parties dans la réserve
  const [suspense, setSuspense] = useState(false)
  const [error, setError] = useState('')
  const stackRef = useRef(null)

  const busy = phase === 'opening' || phase === 'tearing'
  const cards = batch?.openings[current]?.cards ?? []
  const n = cards.length
  const last = current >= count - 1

  const close = useCallback(() => !busy && onClose(), [busy, onClose])

  const tear = async () => {
    setPhase('tearing')
    await wait(reducedMotion() ? 250 : TEAR_MS)
    setPhase('reveal')
  }

  const open = async () => {
    // Booster suivant d'un lot : ses cartes sont déjà tirées, il ne reste qu'à le déchirer
    if (batch) return tear()
    setError('')
    setPhase('opening')
    try {
      const single = (o) => ({ openings: [o], balance: o.balance })
      const request = daily
        ? shopApi.openDailyBooster().then(single)
        : count > 1
          ? shopApi.openBoosters(booster.slug, count, requestId)
          : shopApi.openBooster(booster.slug, requestId).then(single)
      const [res] = await Promise.all([request, wait(reducedMotion() ? 0 : CHARGE_MS)])
      setBatch(res)
      setCurrent(0)
      setStep(0)
      setCleared(0)
      setBalance(res.balance)
      await tear()
    } catch (e) {
      setError(e.message)
      setPhase('error')
    }
  }

  const advance = useCallback(async () => {
    if (phase !== 'reveal' || suspense) return
    if (step >= n) {
      if (last) {
        setPhase('summary')
      } else {
        setCurrent((c) => c + 1)
        setStep(0)
        setCleared(0)
        setPhase('ready')
      }
      return
    }
    // La carte vue part dans la réserve ; la suivante se retourne, après un temps de suspense si elle est rare
    setCleared(step)
    const delay = reducedMotion() ? 0 : SUSPENSE_MS[cards[step].card.rarity] ?? 0
    if (delay) {
      setSuspense(true)
      await wait(delay)
      setSuspense(false)
    }
    setStep((s) => Math.max(s, step + 1)) // « Tout révéler » a pu passer pendant le suspense
  }, [phase, suspense, step, n, cards, last])

  const revealAll = () => {
    setStep(n)
    setCleared(n)
    setSuspense(false)
    setPhase('summary')
  }

  const again = () => {
    setRequestId(uuid())
    setBatch(null)
    setCurrent(0)
    setStep(0)
    setCleared(0)
    setPhase('ready')
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') advance()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [close, advance])

  useEffect(() => {
    if (phase === 'reveal') stackRef.current?.focus({ preventScroll: true })
  }, [phase])

  const summary = useMemo(() => {
    if (!batch) return null
    // Un seul booster : ordre de révélation. Un lot : toutes les cartes, de la plus rare à la moins rare
    const all = batch.openings.flatMap((o) => o.cards)
    const shown = count > 1 ? [...all].sort((a, b) => rarityRank(b.card.rarity) - rarityRank(a.card.rarity)) : all
    const bestIndex = shown.reduce((best, c, i) => (rarityRank(c.card.rarity) > rarityRank(shown[best].card.rarity) ? i : best), 0)
    return { cards: shown, newCount: all.filter((c) => c.is_new).length, bestIndex, best: shown[bestIndex].card }
  }, [batch, count])
  const canAffordAgain = balance != null && balance >= booster.price * count

  const top = step > cleared ? cards[step - 1] : null // carte face visible sur la pile
  const topRank = top ? rarityRank(top.card.rarity) : -1
  const pending = suspense ? cards[step] : null // carte qui va se retourner

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto overflow-x-hidden bg-night-950/95 backdrop-blur-md animate-fade-in" role="dialog" aria-modal="true" aria-label={`Ouverture : ${booster.name}`}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0" style={{ background: `radial-gradient(40rem 30rem at 50% 42%, ${booster.colors[0]}40, transparent 70%)` }} />
        {phase !== 'summary' && <div className={`opening-rays ${busy ? 'is-intense' : ''}`} style={{ '--ray': booster.colors[0] }} />}
      </div>
      {phase === 'tearing' && <div className="screen-flash" style={{ '--flash': `${booster.colors[0]}` }} aria-hidden="true" />}
      {top?.card.rarity === 'SECRET' && <div key={step} className="screen-flash" style={{ '--flash': RARITIES.SECRET.glow }} aria-hidden="true" />}

      <div className="container-page relative flex items-center justify-between py-5">
        <p className="font-display text-lg font-semibold text-white">
          {booster.name}
          {daily && (
            <span className="ml-2 rounded-full bg-gold-400 px-2.5 py-0.5 align-middle text-xs font-bold uppercase tracking-wide text-night-950">
              Offert
            </span>
          )}
          {count > 1 && (
            <span className="ml-2 rounded-full bg-white/10 px-2.5 py-0.5 align-middle text-sm font-medium text-night-200">
              {phase === 'summary' ? `× ${count}` : `${current + 1} / ${count}`}
            </span>
          )}
        </p>
        <div className="flex items-center gap-3">
          {balance != null && <PD amount={balance} className="rounded-full bg-white/5 px-3 py-1.5 text-sm text-gold-200 ring-1 ring-white/10" />}
          <button onClick={close} disabled={busy} aria-label="Fermer" className="rounded-full p-2 text-night-300 transition hover:bg-white/10 hover:text-white disabled:opacity-30">
            <Icon name="x" className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="container-page relative flex flex-1 flex-col items-center justify-center pb-10">
        {/* ------------------------------------------------ le paquet */}
        {(phase === 'ready' || phase === 'opening' || phase === 'tearing' || phase === 'error') && (
          <div className="flex flex-col items-center">
            <Pack
              booster={booster}
              phase={phase === 'error' ? 'ready' : phase}
              onOpen={phase === 'error' ? () => {} : open}
              behind={count - current - 1}
            />
            {phase === 'ready' && (
              <div className="mt-10 text-center">
                <p className="flex items-center justify-center gap-2 font-medium text-white">
                  <Icon name="sparkles" className="h-5 w-5 text-gold-300" /> Glissez le long du pointillé pour déchirer le paquet
                </p>
                <p className="mt-1.5 text-sm text-night-300">
                  {batch ? (
                    `ou touchez-le simplement · booster ${current + 1} sur ${count}`
                  ) : daily ? (
                    'ou touchez-le simplement · votre booster du jour est offert'
                  ) : (
                    <>
                      ou touchez-le simplement
                      {count > 1 && ` · ${count} boosters`} · <PD amount={booster.price * count} className="text-gold-200" />
                    </>
                  )}
                </p>
              </div>
            )}
            {phase === 'opening' && (
              <p className="mt-10 animate-pulse text-night-200">{count > 1 ? `Les ${count} paquets s’ouvrent…` : 'Le paquet s’ouvre…'}</p>
            )}
            {phase === 'error' && (
              <div className="mt-8 w-full max-w-md space-y-4 text-center">
                <Alert>{error}</Alert>
                <div className="flex justify-center gap-3">
                  {error.includes('Solde insuffisant') ? (
                    <ButtonLink to="/pokedollars">
                      <Icon name="wallet" className="h-4 w-4" /> Recharger en PokéDollars
                    </ButtonLink>
                  ) : (
                    <Button onClick={open}>Réessayer</Button>
                  )}
                  <Button variant="secondary" onClick={onClose}>
                    Fermer
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------ la pile de cartes */}
        {phase === 'reveal' && (
          <div className="flex w-full flex-col items-center">
            <button
              ref={stackRef}
              type="button"
              onClick={advance}
              aria-label={step >= n ? (last ? 'Voir le récapitulatif' : 'Booster suivant') : `Révéler la carte ${step + 1} sur ${n}`}
              className="relative aspect-[63/88] w-[min(62vw,17rem)] rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60 focus-visible:ring-offset-8 focus-visible:ring-offset-night-950 sm:w-72"
            >
              {top && topRank >= rarityRank('HOLO') && <Burst key={step} color={glowOf(top.card)} />}
              {cards.map((entry, i) => {
                const gone = i < cleared
                const faceUp = i < step && !gone
                const depth = Math.min(i - step, 5)
                const charging = pending && i === step
                const glow = faceUp && rarityRank(entry.card.rarity) >= rarityRank('RARE') ? glowOf(entry.card) : null
                const transform = gone
                  ? 'translateY(85%) scale(0.18)'
                  : faceUp
                    ? `scale(${rarityRank(entry.card.rarity) >= rarityRank('HOLO') ? 1.06 : 1.02})`
                    : `translate(${depth * 3}px, ${-depth * 3}px) rotate(${jitter(i)}deg)`
                return (
                  <div
                    key={`${entry.card.id}-${i}`}
                    className="stack-card"
                    style={{ transform, zIndex: faceUp ? n + 2 : gone ? 0 : n - i + 1, opacity: gone ? 0 : 1 }}
                  >
                    <div className="stack-enter h-full" style={{ animationDelay: `${(n - 1 - i) * 45}ms` }}>
                      <div className={`h-full ${charging ? 'card-charge' : ''}`} style={charging ? { '--glow': glowOf(entry.card) } : undefined}>
                        <div
                          className={`flip relative h-full rounded-[4.5%/3.2%] ${glow ? 'reveal-glow' : ''}`}
                          style={glow ? { '--glow': glow } : undefined}
                          data-flipped={i < step}
                        >
                          <div className="flip-inner w-full">
                            <div className="flip-face">
                              <CardBack className="h-full w-full" />
                            </div>
                            <div className="flip-face flip-front">
                              {/* Rendue dès le début, face cachée : l'image est chargée quand la carte se retourne */}
                              <PokemonCard card={entry.card} quality="high" interactive={faceUp} className="h-full w-full" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </button>

            <div className="mt-9 flex min-h-[4.5rem] flex-col items-center gap-1.5 text-center" aria-live="polite">
              {top ? (
                <div key={step} className="flex flex-col items-center gap-1.5 animate-pop-in">
                  <div className="flex items-center gap-2">
                    {top.is_new && (
                      <span className="rounded-full bg-gold-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-night-950">Nouvelle</span>
                    )}
                    <RarityBadge rarity={top.card.rarity} label={top.card.rarity_label} />
                  </div>
                  <p className="font-display text-2xl font-bold text-white">{top.card.name}</p>
                </div>
              ) : (
                <p className="font-display text-xl font-semibold text-white">{suspense ? 'Oh… ça brille !' : `${n} cartes vous attendent`}</p>
              )}
              <p className="text-sm text-night-400">
                {suspense
                  ? ' '
                  : step === 0
                    ? 'Touchez la pile pour retourner la première carte'
                    : step < n
                      ? `Carte ${step} sur ${n} · touchez pour la suivante`
                      : last
                        ? `Dernière carte ! Touchez pour voir ${count > 1 ? 'toutes vos cartes' : 'tout le paquet'}`
                        : `Dernière carte de ce booster ! Touchez pour ouvrir le suivant (${current + 2} / ${count})`}
              </p>
            </div>

            {/* La réserve : les cartes déjà vues */}
            <div className="mt-4 flex min-h-[3.25rem] flex-wrap justify-center gap-1.5">
              {cards.slice(0, cleared).map((entry, i) => (
                <div key={`${entry.card.id}-${i}`} className="w-9 animate-pop-in" title={entry.card.name}>
                  <PokemonCard card={entry.card} interactive={false} className="shadow-md" />
                </div>
              ))}
            </div>

            <Button variant="ghost" onClick={revealAll} className="mt-4">
              <Icon name="eye" className="h-4 w-4" /> {count > 1 ? `Tout révéler (${count} boosters)` : 'Tout révéler'}
            </Button>
          </div>
        )}

        {/* ------------------------------------------------ récapitulatif */}
        {phase === 'summary' && summary && (
          <div className="w-full">
            <div className="mb-8 text-center animate-pop-in">
              <p className="font-display text-3xl font-bold text-white">
                {summary.newCount > 0 ? (
                  <>
                    <span className="text-bling">{plural(summary.newCount, 'nouvelle carte', 'nouvelles cartes')}</span> pour votre collection !
                  </>
                ) : (
                  'Que des doublons… la prochaine sera la bonne !'
                )}
              </p>
              <p className="mt-2 text-sm text-night-300">
                {count > 1 && `${count} boosters, ${summary.cards.length} cartes · `}
                Meilleure carte : <strong className="text-white">{summary.best.name}</strong> ({summary.best.rarity_label})
              </p>
            </div>

            <div
              className={`mx-auto grid gap-x-3 gap-y-6 sm:gap-x-5 ${
                count > 1
                  ? 'max-w-6xl grid-cols-3 sm:grid-cols-6 lg:grid-cols-10'
                  : n === 4
                    ? 'max-w-3xl grid-cols-2 sm:grid-cols-4'
                    : `max-w-5xl grid-cols-3 ${n === 6 ? 'sm:grid-cols-6' : 'sm:grid-cols-5'}`
              }`}
            >
              {summary.cards.map((entry, i) => {
                const best = i === summary.bestIndex && rarityRank(entry.card.rarity) >= rarityRank('RARE')
                return (
                  <div key={`${entry.card.id}-${i}`} className="animate-pop-in" style={{ animationDelay: `${i * (count > 1 ? 30 : 70)}ms` }}>
                    <div className={`relative isolate ${best ? 'reveal-glow' : ''}`} style={best ? { '--glow': glowOf(entry.card) } : undefined}>
                      <PokemonCard card={entry.card} quality="high" />
                      {entry.is_new && (
                        <span className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-gold-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-night-950 shadow">
                          Nouvelle
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-col items-center gap-1 text-center">
                      <RarityBadge rarity={entry.card.rarity} className={count > 1 ? 'whitespace-nowrap !px-1.5 !text-[10px]' : ''} />
                      <p className="w-full truncate text-xs font-medium text-night-100">{entry.card.name}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            {daily && <p className="mt-10 text-center text-sm text-night-300">Revenez demain : un nouveau booster vous attend dès minuit.</p>}
            <div className={`flex flex-wrap justify-center gap-3 ${daily ? 'mt-4' : 'mt-10'}`}>
              {daily ? null : canAffordAgain ? (
                <Button onClick={again}>
                  {count > 1 ? `Rouvrir ${count} boosters` : 'Ouvrir un autre booster'} · <PD amount={booster.price * count} />
                </Button>
              ) : (
                <ButtonLink to="/pokedollars">
                  <Icon name="wallet" className="h-4 w-4" /> Recharger en PokéDollars
                </ButtonLink>
              )}
              <ButtonLink to="/collection" variant="secondary">
                <Icon name="grid" className="h-4 w-4" /> Voir ma collection
              </ButtonLink>
              <Button variant="ghost" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
