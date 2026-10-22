import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useCart } from '../context/CartContext.jsx'
import { useWallet } from '../context/WalletContext.jsx'
import { initials } from '../utils/format.js'
import Icon from './Icon.jsx'
import Logo from './Logo.jsx'
import { ProductThumb } from './ProductCard.jsx'
import { PD } from './ui.jsx'

const NAV = [
  { to: '/cards', label: 'Cartes', icon: 'cards' },
  { to: '/boosters', label: 'Boosters', icon: 'gift' },
  { to: '/slots', label: 'Machine à sous', icon: 'sparkles' },
  { to: '/pokedollars', label: 'PokéDollars', icon: 'wallet' },
  { to: '/collection', label: 'Ma collection', icon: 'grid' },
]

function SearchForm({ className = '' }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const [q, setQ] = useState('')

  // Garde le champ synchronisé avec la recherche en cours sur la page des cartes
  useEffect(() => {
    setQ(pathname === '/cards' ? params.get('q') ?? '' : '')
  }, [pathname, params])

  const onSubmit = (e) => {
    e.preventDefault()
    navigate(q.trim() ? `/cards?q=${encodeURIComponent(q.trim())}` : '/cards')
  }

  return (
    <form onSubmit={onSubmit} role="search" className={className}>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-night-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Dracaufeu, Pikachu, 151…"
          aria-label="Rechercher une carte"
          className="w-full rounded-full border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-night-400 transition focus:border-gold-400/60 focus:bg-night-900 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
        />
      </div>
    </form>
  )
}

function AccountMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { pathname } = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [pathname])
  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!user) {
    return (
      <Link
        to="/login"
        state={{ from: { pathname } }}
        className="flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-night-100 transition hover:bg-white/10"
      >
        <Icon name="user" />
        <span className="hidden sm:inline">Se connecter</span>
      </Link>
    )
  }

  const item = 'flex items-center gap-3 px-4 py-2.5 text-sm text-night-100 hover:bg-white/5'
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Mon compte"
        className="flex items-center gap-1.5 rounded-full p-1 pr-2 transition hover:bg-white/10"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-xs font-bold text-night-950">
          {initials(user.full_name)}
        </span>
        <Icon name="chevronDown" className="h-4 w-4 text-night-300" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-night-900 py-1 shadow-2xl shadow-black/50">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="truncate text-sm font-semibold text-white">{user.full_name}</p>
            <p className="truncate text-xs text-night-400">{user.email}</p>
          </div>
          <Link to="/collection" className={item}>
            <Icon name="grid" className="h-5 w-5 text-night-400" /> Ma collection
          </Link>
          <Link to="/pokedollars" className={item}>
            <Icon name="wallet" className="h-5 w-5 text-night-400" /> Mes PokéDollars
          </Link>
          <Link to="/orders" className={item}>
            <Icon name="box" className="h-5 w-5 text-night-400" /> Mes commandes
          </Link>
          <button onClick={logout} className={`${item} w-full border-t border-white/10`}>
            <Icon name="logout" className="h-5 w-5 text-night-400" /> Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}

function WalletChip() {
  const { user } = useAuth()
  const { balance } = useWallet()
  if (!user || balance == null) return null
  return (
    <Link
      to="/pokedollars"
      title="Mes PokéDollars"
      className="flex items-center rounded-full border border-gold-300/30 bg-gold-400/10 px-3 py-1.5 text-sm text-gold-100 transition hover:border-gold-300/60 hover:bg-gold-400/15"
    >
      <PD amount={balance} />
    </Link>
  )
}

function Header() {
  const { cart } = useCart()
  const navClass = ({ isActive }) =>
    `flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition xl:px-3.5 ${
      isActive ? 'bg-white/10 text-white' : 'text-night-300 hover:bg-white/5 hover:text-white'
    }`

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-night-950/80 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center gap-3">
        <Link to="/" aria-label="Accueil PokéBling" className="shrink-0">
          <Logo />
        </Link>

        <nav className="ml-4 hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={navClass}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* Entre lg et xl, la navigation prend la place : la recherche reste sur la page des cartes */}
        <SearchForm className="ml-auto hidden w-full max-w-[16rem] md:block lg:hidden xl:block xl:max-w-xs" />

        <div className="ml-auto flex shrink-0 items-center gap-1.5 md:ml-0 lg:ml-auto xl:ml-0">
          <WalletChip />
          <AccountMenu />
          <Link
            to="/cart"
            aria-label={`Panier (${cart.items_count} articles)`}
            className="relative rounded-full p-2.5 text-night-100 transition hover:bg-white/10"
          >
            <Icon name="bag" className="h-6 w-6" />
            {cart.items_count > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-400 px-1 text-[11px] font-bold text-night-950 ring-2 ring-night-950">
                {cart.items_count}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Navigation mobile */}
      <div className="container-page flex gap-2 overflow-x-auto pb-3 lg:hidden">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `${navClass({ isActive })} shrink-0 ring-1 ring-white/10`}>
            <Icon name={n.icon} className="h-4 w-4" /> {n.label}
          </NavLink>
        ))}
      </div>
    </header>
  )
}

function Toast() {
  const { notice, dismissNotice } = useCart()

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(dismissNotice, 3500)
    return () => clearTimeout(timer)
  }, [notice, dismissNotice])

  if (!notice) return null

  return (
    <div className="fixed inset-x-4 bottom-4 z-40 sm:left-auto sm:right-6 sm:w-96" role="status">
      <div key={notice.id} className="flex animate-pop-in items-center gap-3 rounded-2xl border border-white/10 bg-night-900 p-3 shadow-2xl shadow-black/50">
        {notice.tone === 'success' ? (
          <>
            <ProductThumb item={notice.product} className="h-14 w-10" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-xs font-semibold text-emerald-300">
                <Icon name="checkSimple" className="h-3.5 w-3.5" strokeWidth={2.5} /> Ajouté au panier
              </p>
              <p className="truncate text-sm font-medium text-white">
                {notice.quantity > 1 && `${notice.quantity} × `}
                {notice.product.name}
              </p>
            </div>
            <Link to="/cart" onClick={dismissNotice} className="shrink-0 rounded-lg bg-gold-400 px-3 py-2 text-xs font-bold text-night-950 hover:bg-gold-300">
              Voir le panier
            </Link>
          </>
        ) : (
          <>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-300">
              <Icon name="alert" />
            </span>
            <p className="flex-1 text-sm text-night-100">{notice.message}</p>
            <button onClick={dismissNotice} aria-label="Fermer" className="rounded-lg p-1.5 text-night-400 hover:bg-white/10">
              <Icon name="x" className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Footer() {
  const link = 'hover:text-white'
  return (
    <footer className="mt-24 border-t border-white/10 bg-night-950/60">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-night-400">
            Cartes Pokémon numériques à l’unité, boosters à ouvrir en PokéDollars et collection à compléter.
            Boutique de démonstration construite en microservices : aucun paiement réel.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Boutique</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-night-400">
            <li><Link to="/cards" className={link}>Toutes les cartes</Link></li>
            <li><Link to="/cards?featured=true" className={link}>Cartes d’exception</Link></li>
            <li><Link to="/cards?on_sale=true" className={link}>Promotions</Link></li>
            <li><Link to="/boosters" className={link}>Boosters</Link></li>
            <li><Link to="/slots" className={link}>Machine à sous</Link></li>
            <li><Link to="/pokedollars" className={link}>PokéDollars</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Mon compte</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-night-400">
            <li><Link to="/collection" className={link}>Ma collection</Link></li>
            <li><Link to="/orders" className={link}>Mes commandes</Link></li>
            <li><Link to="/cart" className={link}>Panier</Link></li>
            <li><Link to="/register" className={link}>Créer un compte</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Développeurs</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-night-400">
            <li><a href="/api/shop/docs" target="_blank" rel="noreferrer" className={link}>API boutique (Swagger)</a></li>
            <li><a href="/api/auth/docs" target="_blank" rel="noreferrer" className={link}>API authentification</a></li>
            <li><a href="https://tcgdex.dev" target="_blank" rel="noreferrer" className={link}>Données des cartes : TCGdex</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5">
        <p className="container-page py-6 text-xs leading-relaxed text-night-500">
          © {new Date().getFullYear()} PokéBling — projet pédagogique. Noms et images des cartes fournis par TCGdex.
          Pokémon et les noms associés sont des marques de Nintendo, Creatures Inc. et GAME FREAK inc. ; ce site de
          démonstration n’a aucun lien avec eux.
        </p>
      </div>
    </footer>
  )
}

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-gradient-to-r from-violet-600/30 via-gold-500/20 to-fuchsia-600/30 px-4 py-2 text-center text-xs font-medium text-night-100">
        ✨ Livraison instantanée dans votre collection · Boutique de démonstration : aucun paiement réel
      </div>
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <Toast />
    </div>
  )
}
