import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { shopApi } from '../api.js'
import Icon from '../components/Icon.jsx'
import ProductCard, { ProductGridSkeleton } from '../components/ProductCard.jsx'
import { Alert, Button, EmptyState } from '../components/ui.jsx'
import { plural } from '../utils/format.js'

const PAGE_SIZE = 12
const SORTS = [
  { value: 'popular', label: 'Popularité' },
  { value: 'rating', label: 'Mieux notés' },
  { value: 'price_asc', label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
  { value: 'newest', label: 'Nouveautés' },
]

function Toggle({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-brand-600"
      />
      {children}
    </label>
  )
}

export default function Products() {
  const [params, setParams] = useSearchParams()
  const [categories, setCategories] = useState([])
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const category = params.get('category') ?? ''
  const q = params.get('q') ?? ''
  const sort = params.get('sort') ?? 'popular'
  const onSale = params.get('on_sale') === 'true'
  const featured = params.get('featured') === 'true'
  const inStock = params.get('in_stock') === 'true'
  const page = Math.max(1, Number(params.get('page')) || 1)

  const update = (changes) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value === false || value == null) next.delete(key)
      else next.set(key, value)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  useEffect(() => {
    shopApi.categories().then(setCategories).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError('')
    shopApi
      .products({
        category,
        q,
        sort,
        on_sale: onSale,
        featured,
        in_stock: inStock,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
      .then((res) => !cancelled && setData(res))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [category, q, sort, onSale, featured, inStock, page])

  const currentCategory = categories.find((c) => c.slug === category)
  const title = q
    ? `Résultats pour « ${q} »`
    : currentCategory?.name ?? (onSale ? 'Promotions' : featured ? 'Coups de cœur' : 'Toute la boutique')
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0
  const hasFilters = category || q || onSale || featured || inStock

  return (
    <div className="container-page py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{data ? plural(data.total, 'produit') : '…'}</p>
      </div>

      {/* Catégories en pastilles (mobile / tablette) */}
      <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {[{ slug: '', name: 'Tout', emoji: '✨' }, ...categories].map((c) => (
          <button
            key={c.slug}
            onClick={() => update({ category: c.slug })}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition ${
              category === c.slug ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'
            }`}
          >
            <span>{c.emoji}</span> {c.name}
          </button>
        ))}
      </div>

      <div className="grid gap-10 lg:grid-cols-[15rem_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-8">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Catégories</h2>
              <ul className="mt-3 space-y-0.5">
                {[{ slug: '', name: 'Toute la boutique', emoji: '✨' }, ...categories].map((c) => (
                  <li key={c.slug}>
                    <button
                      onClick={() => update({ category: c.slug })}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                        category === c.slug ? 'bg-brand-50 font-semibold text-brand-700' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-base">{c.emoji}</span>
                      <span className="flex-1">{c.name}</span>
                      {c.product_count != null && <span className="text-xs text-slate-400">{c.product_count}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Filtres</h2>
              <div className="mt-3 space-y-3 px-3">
                <Toggle checked={onSale} onChange={(v) => update({ on_sale: v && 'true' })}>En promotion</Toggle>
                <Toggle checked={featured} onChange={(v) => update({ featured: v && 'true' })}>Coups de cœur</Toggle>
                <Toggle checked={inStock} onChange={(v) => update({ in_stock: v && 'true' })}>Disponibles uniquement</Toggle>
              </div>
            </div>
          </div>
        </aside>

        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {q && (
                <button
                  onClick={() => update({ q: '' })}
                  className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                >
                  « {q} » <Icon name="x" className="h-3.5 w-3.5" />
                </button>
              )}
              <div className="flex gap-2 lg:hidden">
                <button
                  onClick={() => update({ on_sale: !onSale && 'true' })}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${onSale ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'text-slate-600 ring-slate-200'}`}
                >
                  En promotion
                </button>
                <button
                  onClick={() => update({ in_stock: !inStock && 'true' })}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${inStock ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'text-slate-600 ring-slate-200'}`}
                >
                  Disponibles
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-500">
              Trier par
              <select
                value={sort}
                onChange={(e) => update({ sort: e.target.value === 'popular' ? '' : e.target.value })}
                className="rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-2 text-sm font-medium text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && <Alert>{error}</Alert>}

          {data && data.items.length === 0 ? (
            <EmptyState
              icon="search"
              title="Aucun produit trouvé"
              action={hasFilters && <Button variant="secondary" onClick={() => setParams({})}>Réinitialiser les filtres</Button>}
            >
              Essayez une autre recherche ou retirez certains filtres.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3">
              {data ? data.items.map((p) => <ProductCard key={p.id} product={p} />) : <ProductGridSkeleton count={6} />}
            </div>
          )}

          {totalPages > 1 && (
            <nav className="mt-14 flex items-center justify-center gap-1" aria-label="Pagination">
              <Button variant="ghost" className="px-3" disabled={page === 1} onClick={() => update({ page: page - 1 })}>
                <Icon name="chevronLeft" className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => update({ page: n === 1 ? '' : n })}
                  aria-current={n === page ? 'page' : undefined}
                  className={`h-10 w-10 rounded-xl text-sm font-semibold transition ${
                    n === page ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {n}
                </button>
              ))}
              <Button variant="ghost" className="px-3" disabled={page === totalPages} onClick={() => update({ page: page + 1 })}>
                <Icon name="chevronRight" className="h-4 w-4" />
              </Button>
            </nav>
          )}
        </div>
      </div>
    </div>
  )
}
