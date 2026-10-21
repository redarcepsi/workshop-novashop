import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import Logo, { BrandLogo } from './Logo.jsx'

const FEATURES = [
  { icon: 'gift', text: 'Ouvrez des boosters avec vos PokéDollars' },
  { icon: 'grid', text: 'Votre collection et votre panier vous suivent' },
  { icon: 'shield', text: 'Mots de passe bcrypt & sessions JWT' },
]

/** Mise en page en deux colonnes des écrans de connexion / inscription. */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-white/10 bg-gradient-to-br from-night-800 via-night-900 to-night-950 p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-gold-400/15 blur-3xl" />

        <Link to="/" className="relative w-fit">
          <Logo />
        </Link>

        <div className="relative max-w-md">
          <BrandLogo className="mb-10 w-80 drop-shadow-[0_25px_50px_rgba(255,194,28,0.25)]" />
          <h2 className="font-display text-4xl font-bold leading-tight tracking-tight text-white">
            Collectionnez. Ouvrez.
            <br />
            <span className="text-bling">Brillez.</span>
          </h2>
          <ul className="mt-8 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm text-night-100">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-gold-300 ring-1 ring-white/10">
                  <Icon name={f.icon} className="h-5 w-5" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-night-400">Boutique de démonstration — aucun paiement réel.</p>
      </div>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-10 inline-block lg:hidden">
            <Logo />
          </Link>
          <Link to="/" className="mb-8 hidden items-center gap-1.5 text-sm text-night-400 hover:text-white lg:inline-flex">
            <Icon name="arrowLeft" className="h-4 w-4" /> Retour à la boutique
          </Link>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">{title}</h1>
          <p className="mt-2 text-sm text-night-300">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 text-center text-sm text-night-400">{footer}</div>
        </div>
      </div>
    </div>
  )
}
