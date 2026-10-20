import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { shopApi } from '../api.js'
import Icon from '../components/Icon.jsx'
import ProductCard, { ProductBadges } from '../components/ProductCard.jsx'
import ProductVisual from '../components/ProductVisual.jsx'
import { Button, ButtonLink, EmptyState, PageSpinner, Price, QuantityStepper, Stars } from '../components/ui.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatMoney } from '../utils/format.js'

function StockStatus({ stock }) {
  if (stock === 0) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-red-600">
        <span className="h-2 w-2 rounded-full bg-red-500" /> Rupture de stock
      </p>
    )
  }
  if (stock <= 5) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-amber-700">
        <span className="h-2 w-2 rounded-full bg-amber-500" /> Plus que {stock} en stock, commandez vite
      </p>
    )
  }
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
      <span className="h-2 w-2 rounded-full bg-emerald-500" /> En stock, expédié sous 24 h
    </p>
  )
}

const VIEWS = [
  { value: 'pair', label: 'Recto & verso' },
  { value: 'front', label: 'Recto' },
  { value: 'back', label: 'Verso' },
]

function Gallery({ product }) {
  const [view, setView] = useState('pair')

  return (
    <div>
      <div className="relative">
        <ProductVisual item={product} view={view} size="lg" className="aspect-square w-full rounded-3xl" />
        <ProductBadges product={product} />
      </div>
      {product.image_url && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              onClick={() => setView(v.value)}
              aria-pressed={view === v.value}
              className={`overflow-hidden rounded-2xl bg-white text-xs font-medium ring-2 transition ${
                view === v.value ? 'text-slate-900 ring-slate-900' : 'text-slate-500 ring-slate-200 hover:ring-slate-300'
              }`}
            >
              <ProductVisual item={product} view={v.value} className="aspect-square w-full" />
              <span className="block py-2">{v.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ProductDetail() {
  const { slug } = useParams()
  const { addItem } = useCart()
  const [product, setProduct] = useState(undefined)
  const [related, setRelated] = useState([])
  const [quantity, setQuantity] = useState(1)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let cancelled = false
    setProduct(undefined)
    setQuantity(1)
    shopApi
      .product(slug)
      .then((p) => {
        if (cancelled) return
        setProduct(p)
        return shopApi.products({ category: p.category.slug, limit: 5 }).then(
          (r) => !cancelled && setRelated(r.items.filter((x) => x.slug !== slug).slice(0, 4)),
        )
      })
      .catch(() => !cancelled && setProduct(null))
    return () => {
      cancelled = true
    }
  }, [slug])

  if (product === undefined) return <PageSpinner />
  if (product === null) {
    return (
      <div className="container-page">
        <EmptyState icon="search" title="Produit introuvable" action={<ButtonLink to="/products">Retour à la boutique</ButtonLink>}>
          Ce produit n’existe pas ou n’est plus disponible.
        </EmptyState>
      </div>
    )
  }

  const maxQuantity = Math.min(product.stock, 10)
  const onAdd = async () => {
    setAdding(true)
    if (await addItem(product, quantity)) setQuantity(1)
    setAdding(false)
  }

  return (
    <div className="container-page py-8">
      <nav className="mb-8 flex flex-wrap items-center gap-1.5 text-sm text-slate-500" aria-label="Fil d’Ariane">
        <Link to="/" className="hover:text-slate-900">Accueil</Link>
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
        <Link to="/products" className="hover:text-slate-900">Boutique</Link>
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
        <Link to={`/products?category=${product.category.slug}`} className="hover:text-slate-900">
          {product.category.name}
        </Link>
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
        <span className="text-slate-900">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <Gallery key={product.slug} product={product} />

        <div className="flex flex-col">
          <Link
            to={`/products?category=${product.category.slug}`}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            {product.category.name}
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{product.name}</h1>
          <Stars rating={product.rating} count={product.reviews_count} className="mt-3" />

          <div className="mt-6">
            <Price price={product.price} compareAt={product.compare_at_price} size="lg" />
            {product.discount_percent && (
              <p className="mt-1 text-sm font-medium text-rose-600">
                Vous économisez {formatMoney(product.compare_at_price - product.price)}
              </p>
            )}
          </div>

          <p className="mt-6 leading-relaxed text-slate-600">{product.description}</p>

          <div className="mt-8 space-y-4 border-t border-slate-100 pt-8">
            <StockStatus stock={product.stock} />
            {product.in_stock ? (
              <div className="flex flex-wrap gap-3">
                <QuantityStepper value={quantity} onChange={setQuantity} max={maxQuantity} />
                <Button onClick={onAdd} loading={adding} variant="dark" className="flex-1 py-3 sm:flex-none sm:px-10">
                  <Icon name="bag" /> Ajouter au panier
                </Button>
              </div>
            ) : (
              <Button disabled variant="secondary" className="w-full py-3">
                Indisponible pour le moment
              </Button>
            )}
          </div>

          {product.details.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-slate-900">Caractéristiques</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {product.details.map((d) => (
                  <li key={d} className="flex items-start gap-2">
                    <Icon name="checkSimple" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.5} />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="mt-8 space-y-3 rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
            <li className="flex items-center gap-2"><Icon name="truck" className="h-5 w-5 text-slate-400" /> Livraison discrète, offerte dès 50 €</li>
            <li className="flex items-center gap-2"><Icon name="refresh" className="h-5 w-5 text-slate-400" /> Retours gratuits 30 j</li>
            <li className="flex items-center gap-2"><Icon name="lock" className="h-5 w-5 text-slate-400" /> Paiement sécurisé</li>
          </ul>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-24">
          <h2 className="mb-8 text-2xl font-bold tracking-tight text-slate-900">Vous aimerez aussi</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
