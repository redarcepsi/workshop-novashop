import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useCart } from '../context/CartContext.jsx'
import { initials } from '../utils/format.js'
import Icon from './Icon.jsx'
import Logo from './Logo.jsx'
import ProductVisual from './ProductVisual.jsx'

function SearchForm({ className = '' }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const [q, setQ] = useState('')

  // Garde le champ synchronisé avec la recherche en cours sur la page boutique
  useEffect(() => {
    setQ(pathname === '/products' ? params.get('q') ?? '' : '')
  }, [pathname, params])

  const onSubmit = (e) => {
    e.preventDefault()
    navigate(q.trim() ? `/products?q=${encodeURIComponent(q.trim())}` : '/products')
  }

  return (
    <form onSubmit={onSubmit} role="search" className={className}>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un produit…"
          aria-label="Rechercher un produit"
          className="w-full rounded-full border-0 bg-slate-100 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-500 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
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
        className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
      >
        <Icon name="user" />
        <span className="hidden sm:inline">Se connecter</span>
      </Link>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full p-1 pr-2 transition hover:bg-slate-100"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
          {initials(user.full_name)}
        </span>
        <Icon name="chevronDown" className="h-4 w-4 text-slate-500" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{user.full_name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <Link to="/orders" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
            <Icon name="box" className="h-5 w-5 text-slate-400" /> Mes commandes
          </Link>
          <button onClick={logout} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
            <Icon name="logout" className="h-5 w-5 text-slate-400" /> Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}

function NavItem({ to, active, children }) {
  return (
    <Link
      to={to}
      className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
        active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {children}
    </Link>
  )
}

function Header() {
  const { cart } = useCart()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const onSale = params.get('on_sale') === 'true'

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-4">
        <Link to="/" aria-label="Accueil NovaShop">
          <Logo />
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          <NavItem to="/" active={pathname === '/'}>Accueil</NavItem>
          <NavItem to="/products" active={pathname.startsWith('/products') && !onSale}>Boutique</NavItem>
          <NavItem to="/products?on_sale=true" active={pathname === '/products' && onSale}>Promotions</NavItem>
        </nav>

        <SearchForm className="ml-auto hidden w-full max-w-xs md:block lg:max-w-sm" />

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <AccountMenu />
          <Link
            to="/cart"
            aria-label={`Panier (${cart.items_count} articles)`}
            className="relative rounded-full p-2.5 text-slate-700 transition hover:bg-slate-100"
          >
            <Icon name="bag" className="h-6 w-6" />
            {cart.items_count > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white ring-2 ring-white">
                {cart.items_count}
              </span>
            )}
          </Link>
        </div>
      </div>

      <div className="container-page flex items-center gap-2 pb-3 md:hidden">
        <SearchForm className="flex-1" />
        <Link to="/products" className="rounded-full bg-slate-100 px-3.5 py-2.5 text-sm font-medium text-slate-700">
          Boutique
        </Link>
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
    <div className="fixed inset-x-4 bottom-4 z-50 sm:left-auto sm:right-6 sm:w-96" role="status">
      <div key={notice.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
        {notice.tone === 'success' ? (
          <>
            <ProductVisual item={notice.product} size="xs" className="h-12 w-12 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <Icon name="checkSimple" className="h-3.5 w-3.5" strokeWidth={2.5} /> Ajouté au panier
              </p>
              <p className="truncate text-sm font-medium text-slate-900">
                {notice.quantity > 1 && `${notice.quantity} × `}
                {notice.product.name}
              </p>
            </div>
            <Link to="/cart" onClick={dismissNotice} className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
              Voir le panier
            </Link>
          </>
        ) : (
          <>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <Icon name="alert" />
            </span>
            <p className="flex-1 text-sm text-slate-700">{notice.message}</p>
            <button onClick={dismissNotice} aria-label="Fermer" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <Icon name="x" className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-slate-200 bg-white">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-slate-500">
            Body pillows de personnages de jeu vidéo originaux, tous entièrement habillés. Boutique de
            démonstration construite en microservices : aucun paiement réel.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Boutique</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
            <li><Link to="/products" className="hover:text-slate-900">Tous les produits</Link></li>
            <li><Link to="/products?featured=true" className="hover:text-slate-900">Les plus câlinés</Link></li>
            <li><Link to="/products?on_sale=true" className="hover:text-slate-900">Promotions</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Mon compte</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
            <li><Link to="/cart" className="hover:text-slate-900">Panier</Link></li>
            <li><Link to="/orders" className="hover:text-slate-900">Mes commandes</Link></li>
            <li><Link to="/register" className="hover:text-slate-900">Créer un compte</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Développeurs</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
            <li><a href="/api/shop/docs" target="_blank" rel="noreferrer" className="hover:text-slate-900">API boutique (Swagger)</a></li>
            <li><a href="/api/auth/docs" target="_blank" rel="noreferrer" className="hover:text-slate-900">API authentification</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100">
        <p className="container-page py-6 text-xs text-slate-400">© {new Date().getFullYear()} NovaShop — projet pédagogique.</p>
      </div>
    </footer>
  )
}

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-slate-900 px-4 py-2 text-center text-xs font-medium text-white">
        Livraison discrète offerte dès 50 € · Boutique de démonstration : aucun paiement réel
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
