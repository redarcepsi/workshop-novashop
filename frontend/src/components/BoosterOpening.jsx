import { useCallback, useEffect, useMemo, useState } from 'react'
import { shopApi } from '../api.js'
import { useWallet } from '../context/WalletContext.jsx'
import { RARITIES, rarityRank } from '../utils/cards.js'
import { plural } from '../utils/format.js'
import { uuid } from '../utils/uuid.js'
import BoosterPack from './BoosterPack.jsx'
import Icon from './Icon.jsx'
import PokemonCard, { CardBack } from './PokemonCard.jsx'
import { Alert, Button, ButtonLink, PD, RarityBadge } from './ui.jsx'

const SHAKE_MS = 1100
const TEAR_MS = 900

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function RevealCard({ entry, flipped, onFlip, index }) {
  const { card, is_new: isNew } = entry
  const rank = rarityRank(card.rarity)
  const glow = flipped && rank >= rarityRank('RARE') ? RARITIES[card.rarity].glow : null

  return (
    <div className="w-[30%] max-w-[13rem] animate-pop-in sm:w-[15%]" style={{ animationDelay: `${index * 70}ms` }}>
      <button
        type="button"
        className={`flip relative block w-full ${glow ? 'reveal-glow' : ''}`}
        style={glow ? { '--glow': glow } : undefined}
        data-flipped={flipped}
        onClick={onFlip}
        aria-label={flipped ? card.name : `Révéler la carte ${index + 1}`}
      >
        <div className="flip-inner">
          <div className="flip-face transition hover:brightness-110">
            <CardBack className="h-full w-full" />
          </div>
          <div className="flip-face flip-front">
            {/* Rendue dès le début, face cachée : l'image est déjà chargée quand la carte se retourne */}
            <PokemonCard card={card} quality="high" className="h-full w-full" />
          </div>
        </div>
      </button>
      <div className={`mt-2 flex min-h-[2.75rem] flex-col items-center gap-1 text-center transition ${flipped ? 'opacity-100' : 'opacity-0'}`}>
        <div className="flex items-center gap-1.5">
          {isNew && (
            <span className="rounded-full bg-gold-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-night-950">
              Nouveau
            </span>
          )}
          <RarityBadge rarity={card.rarity} />
        </div>
        <p className="w-full truncate text-xs font-medium text-night-100">{card.name}</p>
      </div>
    </div>
  )
}

/**
 * Ouverture d'un booster en plein écran : on touche le paquet, il tremble pendant que le serveur tire les cartes,
 * se déchire, puis les cartes arrivent face cachée et se retournent une à une (la plus rare en dernier).
 */
export default function BoosterOpening({ booster, onClose }) {
  const { balance, setBalance } = useWallet()
  const [phase, setPhase] = useState('ready') // ready → opening → tearing → reveal (ou error)
  // Une clé par ouverture : rejouée telle quelle après une erreur réseau, le serveur ne débite qu'une fois
  const [requestId, setRequestId] = useState(() => uuid())
  const [result, setResult] = useState(null)
  const [flipped, setFlipped] = useState([])
  const [error, setError] = useState('')

  const busy = phase === 'opening' || phase === 'tearing'

  const close = useCallback(() => !busy && onClose(), [busy, onClose])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [close])

  const open = async () => {
    setError('')
    setPhase('opening')
    try {
      const [res] = await Promise.all([shopApi.openBooster(booster.slug, requestId), wait(SHAKE_MS)])
      setResult(res)
      setFlipped(res.cards.map(() => false))
      setBalance(res.balance)
      setPhase('tearing')
      await wait(TEAR_MS)
      setPhase('reveal')
    } catch (e) {
      setError(e.message)
      setPhase('error')
    }
  }

  const again = () => {
    setRequestId(uuid())
    setResult(null)
    setFlipped([])
    setPhase('ready')
  }

  const flip = (i) => setFlipped((f) => f.map((v, j) => (j === i ? true : v)))
  const revealAll = async () => {
    for (let i = 0; i < flipped.length; i++) {
      if (flipped[i]) continue
      flip(i)
      await wait(180)
    }
  }

  const allFlipped = flipped.length > 0 && flipped.every(Boolean)
  const summary = useMemo(() => {
    if (!result) return null
    const best = result.cards.reduce((a, b) => (rarityRank(b.card.rarity) > rarityRank(a.card.rarity) ? b : a))
    return { newCount: result.cards.filter((c) => c.is_new).length, best: best.card }
  }, [result])
  const canAffordAgain = balance != null && balance >= booster.price

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-night-950/95 backdrop-blur-md animate-fade-in" role="dialog" aria-modal="true" aria-label={`Ouverture : ${booster.name}`}>
      <div className="pointer-events-none fixed inset-0" style={{ background: `radial-gradient(40rem 30rem at 50% 40%, ${booster.colors[0]}33, transparent 70%)` }} />

      <div className="container-page relative flex items-center justify-between py-5">
        <p className="font-display text-lg font-semibold text-white">{booster.name}</p>
        <div className="flex items-center gap-3">
          {balance != null && <PD amount={balance} className="rounded-full bg-white/5 px-3 py-1.5 text-sm text-gold-200 ring-1 ring-white/10" />}
          <button onClick={close} disabled={busy} aria-label="Fermer" className="rounded-full p-2 text-night-300 transition hover:bg-white/10 hover:text-white disabled:opacity-30">
            <Icon name="x" className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="container-page relative flex flex-1 flex-col items-center justify-center pb-10">
        {(phase === 'ready' || phase === 'opening' || phase === 'tearing' || phase === 'error') && (
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={phase === 'ready' ? open : undefined}
              disabled={phase !== 'ready'}
              aria-label="Ouvrir le booster"
              className={`w-52 sm:w-64 ${phase === 'ready' ? 'animate-float cursor-pointer' : ''} ${phase === 'opening' ? 'animate-shake' : ''} ${phase === 'tearing' ? 'pack-drop' : ''}`}
            >
              <BoosterPack booster={booster} tearing={phase === 'tearing'} className="w-full" />
            </button>
            {phase === 'ready' && (
              <p className="mt-8 flex items-center gap-2 text-night-200">
                <Icon name="sparkles" className="h-5 w-5 text-gold-300" /> Touchez le paquet pour l’ouvrir
                <span className="text-night-400">·</span> <PD amount={booster.price} className="text-gold-200" />
              </p>
            )}
            {phase === 'opening' && <p className="mt-8 text-night-300">Le paquet s’ouvre…</p>}
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

        {phase === 'reveal' && result && (
          <div className="w-full">
            <div className="flex flex-wrap items-start justify-center gap-3 sm:gap-4">
              {result.cards.map((entry, i) => (
                <RevealCard key={`${entry.card.id}-${i}`} entry={entry} index={i} flipped={flipped[i]} onFlip={() => flip(i)} />
              ))}
            </div>

            <div className="mx-auto mt-8 flex max-w-2xl flex-col items-center gap-5 text-center">
              {!allFlipped ? (
                <Button variant="secondary" onClick={revealAll}>
                  <Icon name="eye" className="h-4 w-4" /> Tout révéler
                </Button>
              ) : (
                <>
                  <div className="animate-pop-in">
                    <p className="font-display text-2xl font-bold text-white">
                      {summary.newCount > 0 ? (
                        <>
                          <span className="text-bling">{plural(summary.newCount, 'nouvelle carte', 'nouvelles cartes')}</span> pour votre collection !
                        </>
                      ) : (
                        'Que des doublons… la prochaine sera la bonne !'
                      )}
                    </p>
                    <p className="mt-2 text-sm text-night-300">
                      Meilleure carte : <strong className="text-white">{summary.best.name}</strong> ({summary.best.rarity_label})
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-3">
                    {canAffordAgain ? (
                      <Button onClick={again}>
                        Ouvrir un autre booster · <PD amount={booster.price} />
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
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
