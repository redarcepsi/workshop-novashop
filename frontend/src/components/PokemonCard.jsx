import { useRef, useState } from 'react'
import { RARITIES, cardImage, isHolo, typeColor } from '../utils/cards.js'
import { Emblem } from './Logo.jsx'

/**
 * Carte de secours, dessinée en CSS : si l'image TCGdex ne se charge pas (poste sans accès à Internet),
 * la boutique reste lisible.
 */
function CardFallback({ card }) {
  const color = typeColor(card)
  return (
    <div
      className="flex h-full w-full flex-col p-[7%] text-night-950"
      style={{ background: `linear-gradient(160deg, #fff8e1 0%, ${color} 55%, #1d1944 140%)` }}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="font-display text-[clamp(.6rem,7cqw,1.4rem)] font-bold leading-tight">{card.name}</p>
        {card.hp && <p className="shrink-0 text-[clamp(.5rem,5cqw,1rem)] font-bold">{card.hp} PV</p>}
      </div>
      <div className="mt-[6%] flex flex-1 items-center justify-center rounded-md bg-white/40 ring-2 ring-white/60">
        <Emblem className="h-1/3 w-1/3 opacity-70" />
      </div>
      <p className="mt-[6%] text-[clamp(.45rem,4.5cqw,.85rem)] font-semibold">
        {RARITIES[card.rarity].symbol} {card.set?.name} · n° {card.number}
      </p>
    </div>
  )
}

/**
 * Une carte Pokémon. `interactive` : s'incline sous le pointeur, avec un reflet ;
 * les cartes holo et plus rares ont en plus l'effet arc-en-ciel et un éclat périodique.
 */
export default function PokemonCard({ card, quality = 'low', interactive = true, className = '', dimmed = false }) {
  const ref = useRef(null)
  const [failed, setFailed] = useState(false)
  const holo = isHolo(card.rarity)

  const onMove = (e) => {
    const el = ref.current
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    el.style.setProperty('--rx', `${(0.5 - y) * 22}deg`)
    el.style.setProperty('--ry', `${(x - 0.5) * 22}deg`)
    el.style.setProperty('--mx', `${x * 100}%`)
    el.style.setProperty('--my', `${y * 100}%`)
    el.style.setProperty('--o', '1')
    el.dataset.active = 'true'
  }
  const onLeave = () => {
    const el = ref.current
    for (const [k, v] of [['--rx', '0deg'], ['--ry', '0deg'], ['--mx', '50%'], ['--my', '50%'], ['--o', '0']]) {
      el.style.setProperty(k, v)
    }
    el.dataset.active = 'false'
  }

  return (
    <div
      ref={ref}
      onPointerMove={interactive ? onMove : undefined}
      onPointerLeave={interactive ? onLeave : undefined}
      className={`poke-card bg-night-800 shadow-xl shadow-black/40 [container-type:inline-size] ${holo && !dimmed ? 'is-holo' : ''} ${className}`}
    >
      {failed ? (
        <CardFallback card={card} />
      ) : (
        <img
          src={cardImage(card.image_url, quality)}
          alt={`${card.name} — ${card.set?.name ?? ''} n° ${card.number}`}
          loading="lazy"
          draggable="false"
          onError={() => setFailed(true)}
          className={dimmed ? 'opacity-25 grayscale' : ''}
        />
      )}
      {interactive && !dimmed && (
        <>
          {holo && <div className="shine" />}
          <div className="glare" />
        </>
      )}
    </div>
  )
}

/** Dos de carte PokéBling (motif original), pour les cartes pas encore révélées. */
export function CardBack({ className = '' }) {
  return (
    <div
      className={`relative flex aspect-[63/88] items-center justify-center overflow-hidden rounded-[4.5%/3.2%] shadow-xl shadow-black/50 ring-1 ring-gold-300/40 ${className}`}
      style={{
        background:
          'radial-gradient(circle at 50% 50%, #2e2962 0%, #16132f 55%, #09071a 100%), #09071a',
      }}
    >
      <div
        className="absolute inset-[5%] rounded-[4%] border-2 border-gold-400/50"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgb(255 194 28 / 0.07) 0 6px, transparent 6px 14px), repeating-linear-gradient(-45deg, rgb(255 194 28 / 0.07) 0 6px, transparent 6px 14px)',
        }}
      />
      <Emblem className="relative h-[58%] w-[58%] drop-shadow-[0_0_18px_rgba(255,194,28,0.45)]" />
      <span className="absolute bottom-[9%] font-display text-[clamp(.55rem,2.2vw,.95rem)] font-bold tracking-[0.25em] text-gold-300/80">
        POKÉBLING
      </span>
    </div>
  )
}
