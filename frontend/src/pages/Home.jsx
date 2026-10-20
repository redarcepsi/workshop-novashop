import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { shopApi } from '../api.js'
import Icon from '../components/Icon.jsx'
import ProductCard, { ProductGridSkeleton } from '../components/ProductCard.jsx'
import ProductVisual from '../components/ProductVisual.jsx'
import { ButtonLink } from '../components/ui.jsx'
import { formatMoney } from '../utils/format.js'

const PERKS = [
  { icon: 'truck', title: 'Livraison discrète', text: 'Colis neutre, offert dès 50 €' },
  { icon: 'refresh', title: 'Recto / verso', text: 'Deux faces imprimées en HD' },
  { icon: 'sparkles', title: 'Peau de pêche', text: 'Ultra-doux, lavable à 30 °C' },
  { icon: 'lock', title: 'Paiement sécurisé', text: 'Carte bancaire (100 % fictive)' },
]

function Hero({ products }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/70 via-white to-white">
      <div className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-brand-200/40 blur-3xl" />
      <div className="container-page relative grid items-center gap-12 py-14 lg:grid-cols-2 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm ring-1 ring-brand-100">
            <Icon name="sparkles" className="h-4 w-4" /> Nouvelle saison : Créatures & monstres
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Des body pillows de héros pour des nuits <span className="text-brand-600">légendaires.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-slate-600">
            Dragonnes, paladins, mages et cyber-ninjas imprimés recto / verso sur 160 cm de douceur.
            Personnages 100 % habillés, câlins 100 % garantis.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/products" variant="dark" className="px-6 py-3">
              Découvrir la boutique <Icon name="arrowRight" className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink to="/products?on_sale=true" variant="secondary" className="px-6 py-3">
              Voir les promotions
            </ButtonLink>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:gap-5">
          {products.slice(0, 4).map((p, i) => (
            <Link
              key={p.id}
              to={`/products/${p.slug}`}
              className={`group relative overflow-hidden rounded-3xl shadow-sm ring-1 ring-slate-900/5 ${i % 2 ? 'translate-y-8' : ''}`}
            >
              <ProductVisual item={p} className="aspect-square w-full" />
              <span className="absolute bottom-3 left-3 right-3 truncate rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-900 backdrop-blur">
                {p.name} · {formatMoney(p.price)}
              </span>
            </Link>
          ))}
          {products.length === 0 &&
            Array.from({ length: 4 }, (_, i) => (
              <div key={i} className={`aspect-square animate-pulse rounded-3xl bg-slate-100 ${i % 2 ? 'translate-y-8' : ''}`} />
            ))}
        </div>
      </div>
    </section>
  )
}

function SectionHeader({ title, subtitle, link, linkLabel = 'Tout voir' }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
      </div>
      {link && (
        <Link to={link} className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
          {linkLabel} <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      )}
    </div>
  )
}

export default function Home() {
  const [categories, setCategories] = useState([])
  const [featured, setFeatured] = useState(null)
  const [deals, setDeals] = useState([])

  useEffect(() => {
    shopApi.categories().then(setCategories).catch(() => {})
    shopApi.products({ featured: true, limit: 8 }).then((r) => setFeatured(r.items)).catch(() => setFeatured([]))
    shopApi.products({ on_sale: true, limit: 4 }).then((r) => setDeals(r.items)).catch(() => {})
  }, [])

  const bestDiscount = Math.max(0, ...deals.map((d) => d.discount_percent ?? 0))

  return (
    <>
      <Hero products={featured ?? []} />

      <section className="border-y border-slate-100 bg-white">
        <div className="container-page grid grid-cols-2 gap-6 py-8 lg:grid-cols-4">
          {PERKS.map((p) => (
            <div key={p.title} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon name={p.icon} />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{p.title}</p>
                <p className="text-xs text-slate-500">{p.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page mt-20">
        <SectionHeader title="Choisissez votre univers" link="/products" linkLabel="Toute la boutique" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <Link
              key={c.slug}
              to={`/products?category=${c.slug}`}
              className="group flex flex-col items-center rounded-2xl border border-slate-200/70 bg-white p-5 text-center transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-4xl transition group-hover:scale-110 group-hover:bg-brand-50">
                {c.emoji}
              </span>
              <span className="mt-3 text-sm font-semibold text-slate-900">{c.name}</span>
              <span className="text-xs text-slate-500">{c.product_count} produits</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container-page mt-20">
        <SectionHeader title="Les plus câlinés" subtitle="Les légendaires de la boutique, approuvés par la guilde." link="/products?featured=true" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
          {featured ? featured.map((p) => <ProductCard key={p.id} product={p} />) : <ProductGridSkeleton count={8} />}
        </div>
      </section>

      {deals.length > 0 && (
        <section className="container-page mt-20">
          <div className="relative grid items-center gap-10 overflow-hidden rounded-3xl bg-slate-900 px-6 py-12 sm:px-12 lg:grid-cols-2">
            <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-rose-500/20 blur-3xl" />
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-300">
                <Icon name="tag" className="h-4 w-4" /> Soldes de la guilde
              </span>
              <h2 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Jusqu’à −{bestDiscount} % sur une sélection
              </h2>
              <p className="mt-3 max-w-md text-slate-300">
                Des prix doux sur nos héros les plus câlinés, dans la limite des stocks disponibles.
              </p>
              <ButtonLink to="/products?on_sale=true" variant="light" className="mt-8 px-6 py-3">
                J’en profite <Icon name="arrowRight" className="h-4 w-4" />
              </ButtonLink>
            </div>
            <div className="relative grid grid-cols-2 gap-4">
              {deals.map((d) => (
                <Link key={d.id} to={`/products/${d.slug}`} className="group relative overflow-hidden rounded-2xl">
                  <ProductVisual item={d} size="sm" view="front" className="aspect-[4/3] w-full" />
                  <span className="absolute right-2 top-2 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
                    −{d.discount_percent} %
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
