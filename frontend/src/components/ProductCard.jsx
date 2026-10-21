import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { cardImage, pokedollarBonus } from '../utils/cards.js'
import { formatNumber } from '../utils/format.js'
import Icon from './Icon.jsx'
import PokemonCard from './PokemonCard.jsx'
import { Coin, Price, RarityBadge, Spinner } from './ui.jsx'

export function ProductBadges({ product }) {
  return (
    <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col items-start gap-1.5">
      {product.discount_percent && (
        <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white shadow">−{product.discount_percent} %</span>
      )}
      {!product.in_stock && (
        <span className="rounded-full bg-night-950/90 px-2 py-0.5 text-xs font-semibold text-white ring-1 ring-white/20">Rupture</span>
      )}
      {product.in_stock && product.stock != null && product.stock <= 3 && (
        <span className="rounded-full bg-gold-300 px-2 py-0.5 text-xs font-bold text-night-950 shadow">
          {product.stock === 1 ? 'Dernier exemplaire' : `Plus que ${product.stock}`}
        </span>
      )}
    </div>
  )
}

function AddButton({ product, className = '' }) {
  const { addItem } = useCart()
  const [adding, setAdding] = useState(false)

  const onAdd = async () => {
    setAdding(true)
    await addItem(product)
    setAdding(false)
  }

  return (
    <button
      onClick={onAdd}
      disabled={adding || !product.in_stock}
      aria-label={`Ajouter ${product.name} au panier`}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-400 text-night-950 shadow-lg shadow-gold-500/20 transition hover:bg-gold-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-night-400 disabled:shadow-none ${className}`}
    >
      {adding ? <Spinner className="h-4 w-4" /> : <Icon name="plus" className="h-5 w-5" strokeWidth={2.2} />}
    </button>
  )
}

/** Tuile d'une carte à l'unité dans la grille de la boutique. */
export default function ProductCard({ product }) {
  const { card } = product
  const url = `/cards/${product.slug}`

  return (
    <div className="group flex flex-col">
      <div className="relative">
        <Link to={url} aria-label={`${product.name}, ${card.set.name}`} className="block transition duration-300 group-hover:-translate-y-1">
          <PokemonCard card={card} />
        </Link>
        <ProductBadges product={product} />
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs text-night-400">
            {card.set.name} · n° {card.number}
          </p>
          <RarityBadge rarity={card.rarity} />
        </div>
        <Link to={url} className="mt-1 truncate font-semibold leading-snug text-white hover:text-gold-200">
          {product.name}
        </Link>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Price price={product.price} compareAt={product.compare_at_price} size="sm" />
          <AddButton product={product} />
        </div>
      </div>
    </div>
  )
}

/** Tas de pièces, plus haut pour les gros lots. */
export function CoinPile({ level = 1, className = '' }) {
  const stacks = [
    [{ x: 50, y: 62 }],
    [{ x: 38, y: 64 }, { x: 62, y: 58 }],
    [{ x: 30, y: 66 }, { x: 52, y: 54 }, { x: 72, y: 64 }],
    [{ x: 26, y: 68 }, { x: 46, y: 52 }, { x: 66, y: 46 }, { x: 78, y: 70 }],
  ][Math.min(level, 4) - 1]
  return (
    <div className={`relative ${className}`} aria-hidden="true">
      {stacks.map((s, i) =>
        Array.from({ length: 2 + i + level }, (_, j) => (
          <Coin
            key={`${i}-${j}`}
            className="absolute h-[34%] w-[34%] drop-shadow-[0_4px_6px_rgba(0,0,0,0.45)]"
            style={{ left: `${s.x - 17}%`, top: `${s.y - 17 - j * 7}%` }}
          />
        )),
      )}
    </div>
  )
}

/** Tuile d'un lot de PokéDollars. */
export function PokeDollarPack({ product, level = 1 }) {
  const bonus = pokedollarBonus(product)
  return (
    <div className="panel group relative flex flex-col overflow-hidden p-5 transition hover:-translate-y-1 hover:border-gold-400/40">
      <div className="pointer-events-none absolute -top-16 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-gold-400/20 blur-3xl transition group-hover:bg-gold-400/30" />
      {bonus > 0 && (
        <span className="absolute right-3 top-3 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-2.5 py-1 text-xs font-bold text-white shadow-lg">
          +{bonus} % offerts
        </span>
      )}
      {product.is_featured && (
        <span className="absolute left-3 top-3 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-gold-200 ring-1 ring-gold-300/30">
          Le plus choisi
        </span>
      )}
      <CoinPile level={level} className="relative mx-auto mt-6 aspect-square w-32" />
      <p className="relative mt-4 text-center font-display text-3xl font-bold text-bling tabular-nums">{formatNumber(product.pokedollars)}</p>
      <p className="relative text-center text-xs font-semibold uppercase tracking-widest text-night-300">PokéDollars</p>
      <p className="relative mt-3 flex-1 text-center text-sm text-night-300">{product.description}</p>
      <div className="relative mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
        <Price price={product.price} />
        <AddButton product={product} className="h-10 w-10" />
      </div>
    </div>
  )
}

/**
 * Vignette d'un article (produit du panier ou ligne de commande) : la carte, ou une pièce pour les PokéDollars.
 */
export function ProductThumb({ item, className = 'h-16 w-12' }) {
  const kind = item.kind
  const image = item.card?.image_url ?? item.image_url
  if (kind === 'CARD' && image) {
    return (
      <div className={`shrink-0 overflow-hidden rounded-md bg-night-800 shadow-md ring-1 ring-white/10 ${className}`}>
        <img src={cardImage(image)} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      </div>
    )
  }
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-gold-400/25 to-night-800 ring-1 ring-gold-300/30 ${className}`}>
      <Coin className="h-3/5 w-3/5" />
    </div>
  )
}

export function ProductGridSkeleton({ count = 8 }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className="animate-pulse">
      <div className="aspect-[63/88] rounded-xl bg-white/5" />
      <div className="mt-3 h-3 w-1/2 rounded bg-white/5" />
      <div className="mt-2 h-4 w-3/4 rounded bg-white/5" />
      <div className="mt-3 h-4 w-1/3 rounded bg-white/5" />
    </div>
  ))
}
