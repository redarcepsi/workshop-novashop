import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import Icon from './Icon.jsx'
import ProductVisual from './ProductVisual.jsx'
import { Price, Spinner, Stars } from './ui.jsx'

export function ProductBadges({ product }) {
  return (
    <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
      {product.discount_percent && (
        <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
          −{product.discount_percent} %
        </span>
      )}
      {!product.in_stock && (
        <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-xs font-semibold text-white">Rupture</span>
      )}
      {product.in_stock && product.stock <= 5 && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
          Plus que {product.stock}
        </span>
      )}
    </div>
  )
}

export default function ProductCard({ product }) {
  const { addItem } = useCart()
  const [adding, setAdding] = useState(false)
  const url = `/products/${product.slug}`

  const onAdd = async () => {
    setAdding(true)
    await addItem(product)
    setAdding(false)
  }

  return (
    <div className="group relative flex flex-col">
      <div className="relative">
        <Link to={url} tabIndex={-1} aria-hidden="true">
          <ProductVisual item={product} className="aspect-square w-full rounded-2xl" />
        </Link>
        <ProductBadges product={product} />
        {product.in_stock && (
          <button
            onClick={onAdd}
            disabled={adding}
            aria-label={`Ajouter ${product.name} au panier`}
            className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900 shadow-md ring-1 ring-slate-900/5 transition hover:bg-slate-900 hover:text-white sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100 sm:focus-visible:translate-y-0 sm:focus-visible:opacity-100"
          >
            {adding ? <Spinner className="h-4 w-4" /> : <Icon name="plus" className="h-5 w-5" strokeWidth={2} />}
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        <p className="text-xs text-slate-500">{product.category.name}</p>
        <Link to={url} className="mt-0.5 font-semibold leading-snug text-slate-900 hover:text-brand-700">
          {product.name}
        </Link>
        <Stars rating={product.rating} count={product.reviews_count} className="mt-1.5" />
        <div className="mt-2">
          <Price price={product.price} compareAt={product.compare_at_price} />
        </div>
      </div>
    </div>
  )
}

export function ProductGridSkeleton({ count = 8 }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className="animate-pulse">
      <div className="aspect-square rounded-2xl bg-slate-100" />
      <div className="mt-3 h-3 w-1/3 rounded bg-slate-100" />
      <div className="mt-2 h-4 w-3/4 rounded bg-slate-100" />
      <div className="mt-3 h-4 w-1/4 rounded bg-slate-100" />
    </div>
  ))
}
