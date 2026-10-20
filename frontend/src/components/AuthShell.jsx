import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import Logo from './Logo.jsx'

const FEATURES = [
  { icon: 'truck', text: 'Livraison discrète offerte dès 50 €' },
  { icon: 'bag', text: 'Votre panier vous suit après connexion' },
  { icon: 'shield', text: 'Mots de passe bcrypt & sessions JWT' },
]

const COLLAGE = ['dragonnette-xxl', 'paladin-de-chevet', 'slime-royal', 'cyber-ninja-nuit-blanche']

/** Mise en page en deux colonnes des écrans de connexion / inscription. */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-800 to-brand-950 p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl" />

        <Link to="/" className="relative w-fit">
          <Logo light />
        </Link>

        <div className="relative max-w-md">
          <div className="mb-10 grid w-72 grid-cols-2 gap-3">
            {COLLAGE.map((slug, i) => (
              <img
                key={slug}
                src={`/api/shop/media/${slug}.svg?view=front`}
                alt=""
                className={`aspect-square rounded-2xl ring-1 ring-white/20 ${i % 2 ? 'translate-y-5' : ''}`}
              />
            ))}
          </div>
          <h2 className="text-4xl font-bold leading-tight tracking-tight text-white">
            Des héros pour vos nuits,
            <br />
            sans dépenser un centime.
          </h2>
          <ul className="mt-8 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm text-white/90">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon name={f.icon} className="h-5 w-5" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-brand-200/70">Boutique de démonstration — aucun paiement réel.</p>
      </div>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-10 inline-block lg:hidden">
            <Logo />
          </Link>
          <Link to="/" className="mb-8 hidden items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 lg:inline-flex">
            <Icon name="arrowLeft" className="h-4 w-4" /> Retour à la boutique
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 text-center text-sm text-slate-500">{footer}</div>
        </div>
      </div>
    </div>
  )
}
