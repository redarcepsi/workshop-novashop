import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { shopApi } from '../api.js'
import Icon from '../components/Icon.jsx'
import ProductCard, { ProductGridSkeleton } from '../components/ProductCard.jsx'
import { Alert, Button, EmptyState } from '../components/ui.jsx'
import { RARITIES, RARITY_ORDER, TYPES, setLogo } from '../utils/cards.js'
import { plural } from '../utils/format.js'

const PAGE_SIZE = 24
const SORTS = [
  { value: 'featured', label: 'Mises en avant' },
  { value: 'rarity', label: 'Les plus rares' },
  { value: 'price_asc', label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
  { value: 'number', label: 'Numéro dans le set' },
  { value: 'name', label: 'Nom' },
  { value: 'newest', label: 'Sets récents' },
]
const CATEGORIES = ['Pokémon', 'Dresseur', 'Énergie']

function Chip({ active, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
        active ? 'bg-gold-400 text-night-950 ring-gold-400' : 'bg-white/5 text-night-200 ring-white/10 hover:bg-white/10 hover:text-white'
      } ${className}`}
    >
      {children}
    </button>
  )
}

function Toggle({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-night-200">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-gold-400" />
      {children}
    </label>
  )
}

function FilterGroup({ title, children }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-night-400">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  )
}

export default function Cards() {
  const [params, setParams] = useSearchParams()
  const [sets, setSets] = useState([])
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const set = params.get('set') ?? ''
  const rarity = params.get('rarity') ?? ''
  const type = params.get('type') ?? ''
  const category = params.get('category') ?? ''
  const q = params.get('q') ?? ''
  const sort = params.get('sort') ?? 'featured'
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
  const toggle = (key, value, current) => update({ [key]: current === value ? '' : value })

  useEffect(() => {
    shopApi.sets().then(setSets).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError('')
    shopApi
      .products({
        kind: 'CARD',
        set,
        rarity,
        type,
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
  }, [set, rarity, type, category, q, sort, onSale, featured, inStock, page])

  const currentSet = sets.find((s) => s.id === set)
  const title = q
    ? `Résultats pour « ${q} »`
    : currentSet?.name ?? (onSale ? 'Promotions' : featured ? 'Cartes d’exception' : 'Toutes les cartes')
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0
  const hasFilters = set || rarity || type || category || q || onSale || featured || inStock

  const filters = (
    <div className="space-y-8">
      <FilterGroup title="Sets">
        <ul className="space-y-1">
          {[{ id: '', name: 'Tous les sets' }, ...sets].map((s) => (
            <li key={s.id}>
              <button
                onClick={() => update({ set: s.id })}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                  set === s.id ? 'bg-white/10 font-semibold text-white' : 'text-night-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex h-6 w-10 shrink-0 items-center justify-center">
                  {s.logo_url ? (
                    <img src={setLogo(s.logo_url)} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                  ) : (
                    <Icon name="cards" className="h-4 w-4" />
                  )}
                </span>
                <span className="flex-1">{s.name}</span>
                {s.card_count != null && <span className="text-xs text-night-500">{s.card_count}</span>}
              </button>
            </li>
          ))}
        </ul>
      </FilterGroup>

      <FilterGroup title="Rareté">
        <div className="flex flex-wrap gap-2">
          {[...RARITY_ORDER].reverse().map((r) => (
            <Chip key={r} active={rarity === r} onClick={() => toggle('rarity', r, rarity)}>
              <span aria-hidden="true">{RARITIES[r].symbol}</span> {RARITIES[r].label}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Type">
        <div className="flex flex-wrap gap-2">
          {Object.entries(TYPES).map(([name, t]) => (
            <Chip key={name} active={type === name} onClick={() => toggle('type', name, type)}>
              <span aria-hidden="true">{t.emoji}</span> {name}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Catégorie">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => toggle('category', c, category)}>
              {c}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Filtres">
        <div className="space-y-3 px-1">
          <Toggle checked={onSale} onChange={(v) => update({ on_sale: v && 'true' })}>En promotion</Toggle>
          <Toggle checked={featured} onChange={(v) => update({ featured: v && 'true' })}>Cartes d’exception</Toggle>
          <Toggle checked={inStock} onChange={(v) => update({ in_stock: v && 'true' })}>Disponibles uniquement</Toggle>
        </div>
      </FilterGroup>
    </div>
  )

  return (
    <div className="container-page py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          {currentSet?.logo_url && <img src={setLogo(currentSet.logo_url)} alt="" className="hidden h-14 object-contain sm:block" />}
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-white">{title}</h1>
            <p className="mt-1 text-sm text-night-400">
              {data ? plural(data.total, 'carte') : '…'} · cartes numériques, ajoutées à votre collection dès le paiement
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[16rem_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-6 pr-2">{filters}</div>
        </aside>

        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" className="lg:hidden" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
                <Icon name="filter" className="h-4 w-4" /> Filtres
              </Button>
              {q && (
                <Chip active onClick={() => update({ q: '' })}>
                  « {q} » <Icon name="x" className="h-3.5 w-3.5" />
                </Chip>
              )}
              {hasFilters && (
                <button onClick={() => setParams({})} className="text-xs font-medium text-night-400 underline-offset-2 hover:text-white hover:underline">
                  Tout effacer
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-night-400">
              Trier par
              <select
                value={sort}
                onChange={(e) => update({ sort: e.target.value === 'featured' ? '' : e.target.value })}
                className="rounded-xl border border-white/10 bg-night-900 py-2 pl-3 pr-2 text-sm font-medium text-white focus:border-gold-400/60 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filtersOpen && <div className="panel mb-8 p-5 lg:hidden">{filters}</div>}

          {error && <Alert>{error}</Alert>}

          {data && data.items.length === 0 ? (
            <EmptyState
              icon="search"
              title="Aucune carte trouvée"
              action={hasFilters && <Button variant="secondary" onClick={() => setParams({})}>Réinitialiser les filtres</Button>}
            >
              Essayez une autre recherche ou retirez certains filtres.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 xl:grid-cols-4">
              {data ? data.items.map((p) => <ProductCard key={p.id} product={p} />) : <ProductGridSkeleton count={8} />}
            </div>
          )}

          {totalPages > 1 && (
            <nav className="mt-14 flex flex-wrap items-center justify-center gap-1" aria-label="Pagination">
              <Button variant="ghost" className="px-3" disabled={page === 1} onClick={() => update({ page: page - 1 })} aria-label="Page précédente">
                <Icon name="chevronLeft" className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
                .map((n, i, shown) => (
                  <span key={n} className="flex items-center gap-1">
                    {i > 0 && n - shown[i - 1] > 1 && <span className="px-1 text-night-500">…</span>}
                    <button
                      onClick={() => update({ page: n === 1 ? '' : n })}
                      aria-current={n === page ? 'page' : undefined}
                      className={`h-10 w-10 rounded-xl text-sm font-semibold transition ${
                        n === page ? 'bg-gold-400 text-night-950' : 'text-night-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {n}
                    </button>
                  </span>
                ))}
              <Button variant="ghost" className="px-3" disabled={page === totalPages} onClick={() => update({ page: page + 1 })} aria-label="Page suivante">
                <Icon name="chevronRight" className="h-4 w-4" />
              </Button>
            </nav>
          )}
        </div>
      </div>
    </div>
  )
}
