import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { shopApi } from '../api.js'
import BoosterPack from '../components/BoosterPack.jsx'
import Icon from '../components/Icon.jsx'
import { BrandLogo } from '../components/Logo.jsx'
import PokemonCard from '../components/PokemonCard.jsx'
import ProductCard, { CoinPile, ProductGridSkeleton } from '../components/ProductCard.jsx'
import { ButtonLink, PD, SectionHeader } from '../components/ui.jsx'
import { setLogo } from '../utils/cards.js'
import { formatMoney, formatNumber } from '../utils/format.js'

const STEPS = [
  {
    icon: 'wallet',
    title: 'Rechargez en PokéDollars',
    text: 'Payez par carte et recevez vos PokéDollars à l’instant, avec jusqu’à 40 % offerts.',
    to: '/pokedollars',
  },
  {
    icon: 'gift',
    title: 'Ouvrez des boosters',
    text: 'Chaque paquet cache 5 ou 6 cartes, dont une rare garantie. Qui sait ce qui brille dedans ?',
    to: '/boosters',
  },
  {
    icon: 'grid',
    title: 'Complétez votre collection',
    text: 'Suivez vos sets carte par carte. Il en manque une ? Achetez-la directement à l’unité.',
    to: '/collection',
  },
]

function Hero({ showcase, stats }) {
  return (
    <section className="relative overflow-hidden">
      <div className="container-page relative grid items-center gap-14 py-14 lg:grid-cols-2 lg:py-24">
        <div>
          <BrandLogo className="-ml-3 mb-6 w-44 drop-shadow-[0_20px_40px_rgba(255,194,28,0.25)] sm:w-56" />
          <span className="inline-flex items-center gap-2 rounded-full border border-gold-300/30 bg-gold-400/10 px-3 py-1 text-xs font-semibold text-gold-200">
            <Icon name="sparkles" className="h-4 w-4" /> Nouveau : le booster Évolutions Prismatiques
          </span>
          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Les cartes Pokémon qui font <span className="text-bling">bling.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-night-200">
            Du Set de Base de 1999 aux illustrations spéciales d’aujourd’hui. Ouvrez des boosters
            avec vos PokéDollars, ou offrez-vous directement la carte de vos rêves.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <ButtonLink to="/boosters" className="px-6 py-3 text-base">
              <Icon name="gift" className="h-5 w-5" /> Ouvrir un booster
            </ButtonLink>
            <ButtonLink to="/cards" variant="secondary" className="px-6 py-3 text-base">
              Acheter des cartes <Icon name="arrowRight" className="h-4 w-4" />
            </ButtonLink>
          </div>
          {stats && (
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-white/10 pt-8">
              {stats.map(([value, label]) => (
                <div key={label} className="flex flex-col-reverse">
                  <dt className="text-sm text-night-400">{label}</dt>
                  <dd className="font-display text-3xl font-bold text-white">{formatNumber(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* Éventail de trois cartes d'exception */}
        <div className="relative mx-auto flex h-[26rem] w-full max-w-lg items-center justify-center sm:h-[30rem]">
          <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-violet-600/30 via-fuchsia-500/10 to-gold-400/30 blur-3xl" />
          {showcase.map((product, i) => (
            <Link
              key={product.id}
              to={`/cards/${product.slug}`}
              className="absolute w-44 sm:w-56"
              style={{
                transform: `translateX(${(i - 1) * 62}%) rotate(${(i - 1) * 10}deg) translateY(${i === 1 ? -6 : 18}px)`,
                zIndex: i === 1 ? 3 : 1,
              }}
            >
              <div className="animate-float" style={{ animationDelay: `${i * 1.2}s` }}>
                <PokemonCard card={product.card} quality="high" className="shadow-2xl shadow-black/60" />
              </div>
              {i === 1 && (
                <span className="absolute -bottom-12 left-1/2 w-max -translate-x-1/2 rounded-full bg-night-900/90 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur">
                  {product.name} · <span className="text-gold-200">{formatMoney(product.price)}</span>
                </span>
              )}
            </Link>
          ))}
          {showcase.length === 0 &&
            [0, 1, 2].map((i) => (
              <div
                key={i}
                className="absolute aspect-[63/88] w-44 animate-pulse rounded-xl bg-white/5 sm:w-56"
                style={{ transform: `translateX(${(i - 1) * 62}%) rotate(${(i - 1) * 10}deg)` }}
              />
            ))}
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  const [showcase, setShowcase] = useState([])
  const [featured, setFeatured] = useState(null)
  const [boosters, setBoosters] = useState([])
  const [packs, setPacks] = useState([])
  const [sets, setSets] = useState([])

  useEffect(() => {
    shopApi
      .products({ kind: 'CARD', featured: true, sort: 'price_desc', limit: 11 })
      .then((r) => {
        setShowcase(r.items.slice(0, 3))
        setFeatured(r.items.slice(3, 11))
      })
      .catch(() => setFeatured([]))
    shopApi.boosters().then(setBoosters).catch(() => {})
    shopApi.products({ kind: 'POKEDOLLARS', sort: 'price_asc' }).then((r) => setPacks(r.items)).catch(() => {})
    shopApi.sets().then(setSets).catch(() => {})
  }, [])

  return (
    <>
      <Hero
        showcase={showcase}
        stats={
          sets.length > 0 && [
            [sets.reduce((n, s) => n + s.card_count, 0), 'cartes'],
            [sets.length, 'sets'],
            [boosters.length, 'boosters'],
          ]
        }
      />

      <section className="container-page">
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Link key={s.title} to={s.to} className="panel group relative p-6 transition hover:-translate-y-0.5 hover:border-gold-300/30">
              <span className="absolute right-5 top-4 font-display text-5xl font-bold text-white/5">{i + 1}</span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 text-night-950 shadow-lg shadow-gold-500/20">
                <Icon name={s.icon} className="h-6 w-6" strokeWidth={2} />
              </span>
              <h3 className="mt-5 font-display text-xl font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm text-night-300">{s.text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="container-page mt-24">
        <SectionHeader
          eyebrow="Payés en PokéDollars"
          title="Les boosters"
          subtitle="Du Set de Base de 1999 au tout nouveau Évolutions Prismatiques. Les cartes sont tirées par nos serveurs, à chaque ouverture."
          link="/boosters"
          linkLabel="Ouvrir un booster"
        />
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
          {boosters.map((b) => (
            <Link key={b.slug} to="/boosters" className="group text-center">
              <BoosterPack booster={b} className="transition duration-300 group-hover:-translate-y-2 group-hover:rotate-2" />
              <p className="mt-4 text-sm font-semibold text-white">{b.name.replace('Booster ', '')}</p>
              <PD amount={b.price} className="mt-1 text-sm text-gold-200" />
            </Link>
          ))}
          {boosters.length === 0 && Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-[5/8] animate-pulse rounded-xl bg-white/5" />)}
        </div>
      </section>

      <section className="container-page mt-24">
        <SectionHeader
          eyebrow="À l’unité"
          title="Cartes d’exception"
          subtitle="Les graals des collectionneurs, en exemplaires très limités. Passez la souris dessus pour les voir briller."
          link="/cards?featured=true"
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
          {featured ? featured.map((p) => <ProductCard key={p.id} product={p} />) : <ProductGridSkeleton count={8} />}
        </div>
      </section>

      {packs.length > 0 && (
        <section className="container-page mt-24">
          <div className="relative grid items-center gap-10 overflow-hidden rounded-3xl border border-gold-300/20 bg-gradient-to-br from-night-800 via-night-900 to-night-950 px-6 py-12 sm:px-12 lg:grid-cols-2">
            <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-gold-400/20 blur-3xl" />
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-400/15 px-3 py-1 text-xs font-semibold text-gold-200">
                <Icon name="wallet" className="h-4 w-4" /> Monnaie PokéBling
              </span>
              <h2 className="mt-5 font-display text-4xl font-bold tracking-tight text-white">
                Faites le plein de <span className="text-bling">PokéDollars</span>
              </h2>
              <p className="mt-3 max-w-md text-night-300">
                Environ 100 PokéDollars par euro, et jusqu’à 40 % offerts sur les gros lots. Crédités dès le paiement,
                ils servent à ouvrir tous les boosters de la boutique.
              </p>
              <ButtonLink to="/pokedollars" className="mt-8 px-6 py-3">
                Voir les lots <Icon name="arrowRight" className="h-4 w-4" />
              </ButtonLink>
            </div>
            <div className="relative grid grid-cols-2 gap-4">
              {packs.map((p, i) => (
                <Link key={p.id} to="/pokedollars" className="panel flex items-center gap-4 p-4 transition hover:border-gold-300/40">
                  <CoinPile level={i + 1} className="aspect-square w-14 shrink-0" />
                  <div>
                    <PD amount={p.pokedollars} className="text-lg text-gold-100" />
                    <p className="text-sm text-night-300">{formatMoney(p.price)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {sets.length > 0 && (
        <section className="container-page mt-24">
          <SectionHeader eyebrow="Explorer" title="Par set" link="/cards" linkLabel="Toutes les cartes" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {sets.map((s) => (
              <Link
                key={s.id}
                to={`/cards?set=${encodeURIComponent(s.id)}&sort=number`}
                className="panel group flex flex-col items-center p-5 text-center transition hover:-translate-y-0.5 hover:border-white/20"
              >
                <div className="flex h-16 w-full items-center justify-center">
                  {s.logo_url ? (
                    <img src={setLogo(s.logo_url)} alt="" className="max-h-full max-w-full object-contain transition group-hover:scale-105" loading="lazy" />
                  ) : (
                    <Icon name="cards" className="h-8 w-8 text-night-300" />
                  )}
                </div>
                <p className="mt-4 text-sm font-semibold text-white">{s.name}</p>
                <p className="text-xs text-night-400">
                  {s.card_count} cartes · {s.release_date?.slice(0, 4)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
