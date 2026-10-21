import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { shopApi } from '../api.js'
import Icon from '../components/Icon.jsx'
import PokemonCard from '../components/PokemonCard.jsx'
import ProductCard, { ProductBadges } from '../components/ProductCard.jsx'
import { Button, ButtonLink, EmptyState, PageSpinner, Price, QuantityStepper, RarityBadge } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useCart } from '../context/CartContext.jsx'
import { BOOSTER_BY_SET, TYPES, setLogo, typeColor } from '../utils/cards.js'
import { formatMoney } from '../utils/format.js'

function StockStatus({ stock }) {
  if (stock === 0) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-red-300">
        <span className="h-2 w-2 rounded-full bg-red-400" /> Rupture : tentez votre chance dans un booster !
      </p>
    )
  }
  if (stock <= 3) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-gold-200">
        <span className="h-2 w-2 animate-pulse rounded-full bg-gold-400" />
        {stock === 1 ? 'Dernier exemplaire disponible' : `Plus que ${stock} exemplaires`}
      </p>
    )
  }
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-emerald-300">
      <span className="h-2 w-2 rounded-full bg-emerald-400" /> En stock · livrée instantanément dans votre collection
    </p>
  )
}

function Spec({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 text-sm">
      <dt className="text-night-400">{label}</dt>
      <dd className="text-right font-medium text-white">{children}</dd>
    </div>
  )
}

export default function CardDetail() {
  const { slug } = useParams()
  const { user } = useAuth()
  const { addItem } = useCart()
  const [product, setProduct] = useState(undefined)
  const [related, setRelated] = useState([])
  const [owned, setOwned] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let cancelled = false
    setProduct(undefined)
    setQuantity(1)
    setRelated([])
    shopApi
      .product(slug)
      .then((p) => {
        if (cancelled) return
        setProduct(p)
        if (p.kind !== 'CARD') return
        // Le même Pokémon dans les autres sets
        const pokemon = p.card.name.replace(/-ex$/, '')
        return shopApi
          .products({ kind: 'CARD', q: pokemon, sort: 'rarity', limit: 9 })
          .then((r) => !cancelled && setRelated(r.items.filter((x) => x.slug !== slug).slice(0, 4)))
      })
      .catch(() => !cancelled && setProduct(null))
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (!user || !product?.card) return setOwned(0)
    shopApi
      .collection()
      .then((c) => setOwned(c.items.find((i) => i.card.id === product.card.id)?.quantity ?? 0))
      .catch(() => {})
  }, [user, product])

  if (product === undefined) return <PageSpinner />
  if (product === null || product.kind !== 'CARD') {
    return (
      <div className="container-page">
        <EmptyState icon="search" title="Carte introuvable" action={<ButtonLink to="/cards">Toutes les cartes</ButtonLink>}>
          Cette carte n’existe pas ou n’est plus disponible.
        </EmptyState>
      </div>
    )
  }

  const { card } = product
  const booster = BOOSTER_BY_SET[card.set.id]
  const maxQuantity = Math.min(product.stock ?? 10, 10)
  const onAdd = async () => {
    setAdding(true)
    if (await addItem(product, quantity)) setQuantity(1)
    setAdding(false)
  }

  return (
    <div className="container-page py-8">
      <nav className="mb-8 flex flex-wrap items-center gap-1.5 text-sm text-night-400" aria-label="Fil d’Ariane">
        <Link to="/" className="hover:text-white">Accueil</Link>
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
        <Link to="/cards" className="hover:text-white">Cartes</Link>
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
        <Link to={`/cards?set=${encodeURIComponent(card.set.id)}&sort=number`} className="hover:text-white">
          {card.set.name}
        </Link>
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
        <span className="text-white">{card.name}</span>
      </nav>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16">
        <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
          <div
            className="pointer-events-none absolute inset-0 scale-110 rounded-full opacity-40 blur-3xl"
            style={{ background: `radial-gradient(circle, ${typeColor(card)} 0%, transparent 70%)` }}
          />
          <div className="relative">
            <PokemonCard card={card} quality="high" />
            <ProductBadges product={product} />
          </div>
          <p className="mt-4 text-center text-xs text-night-500">Passez la souris sur la carte pour la faire briller</p>
        </div>

        <div className="flex flex-col">
          <Link to={`/cards?set=${encodeURIComponent(card.set.id)}&sort=number`} className="flex w-fit items-center gap-3">
            {card.set.logo_url && <img src={setLogo(card.set.logo_url)} alt="" className="h-8 object-contain" />}
            <span className="text-sm font-semibold text-gold-300 hover:text-gold-200">
              {card.set.name} · n° {card.number}
            </span>
          </Link>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">{card.name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <RarityBadge rarity={card.rarity} label={card.rarity_label} className="px-2.5 py-1 text-xs" />
            {card.types.map((t) => (
              <span key={t} className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-night-100 ring-1 ring-white/10">
                {TYPES[t]?.emoji} {t}
              </span>
            ))}
            {card.hp && <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-night-100 ring-1 ring-white/10">{card.hp} PV</span>}
            {owned > 0 && (
              <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                ✓ Dans votre collection (× {owned})
              </span>
            )}
          </div>

          {card.description && <p className="mt-6 max-w-xl italic leading-relaxed text-night-200">« {card.description} »</p>}

          <div className="panel mt-8 p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Price price={product.price} compareAt={product.compare_at_price} size="lg" />
                {product.discount_percent && (
                  <p className="mt-1 text-sm font-medium text-rose-300">
                    Vous économisez {formatMoney(product.compare_at_price - product.price)}
                  </p>
                )}
              </div>
              <StockStatus stock={product.stock} />
            </div>
            {product.in_stock ? (
              <div className="mt-6 flex flex-wrap gap-3">
                <QuantityStepper value={quantity} onChange={setQuantity} max={maxQuantity} />
                <Button onClick={onAdd} loading={adding} className="flex-1 py-3 sm:flex-none sm:px-10">
                  <Icon name="bag" /> Ajouter au panier
                </Button>
              </div>
            ) : (
              <Button disabled variant="secondary" className="mt-6 w-full py-3">
                Indisponible à l’unité pour le moment
              </Button>
            )}
            {booster && (
              <Link
                to="/boosters"
                className="mt-5 flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm text-night-200 ring-1 ring-white/10 transition hover:bg-white/10"
              >
                <Icon name="gift" className="h-5 w-5 shrink-0 text-gold-300" />
                <span className="flex-1">
                  Plutôt joueur ? Cette carte peut sortir du <strong className="text-white">booster {card.set.name}</strong>.
                </span>
                <Icon name="arrowRight" className="h-4 w-4 text-night-400" />
              </Link>
            )}
          </div>

          <dl className="mt-8 divide-y divide-white/10 border-y border-white/10">
            <Spec label="Set">{card.set.name}</Spec>
            <Spec label="Numéro">{card.number}</Spec>
            <Spec label="Rareté">{card.rarity_label}</Spec>
            <Spec label="Catégorie">{card.category}</Spec>
            {card.illustrator && <Spec label="Illustration">{card.illustrator}</Spec>}
          </dl>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-24">
          <h2 className="mb-8 font-display text-3xl font-bold tracking-tight text-white">Dans d’autres sets</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-4 sm:gap-x-6">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
