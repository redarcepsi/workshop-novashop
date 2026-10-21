import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import AuthShell from '../components/AuthShell.jsx'
import { Alert, Button, Field } from '../components/ui.jsx'
import { initials } from '../utils/format.js'
import { useAuth } from '../context/AuthContext.jsx'

// Créés automatiquement par auth-service au démarrage (services/auth-service/app/seed.py)
const DEMO_ACCOUNTS = [
  { email: 'leo@novashop.fr', password: 'Demo1234', name: 'Léo Martin' },
  { email: 'ines@novashop.fr', password: 'Demo1234', name: 'Inès Durand' },
]

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = location.state?.from?.pathname || '/'
  const fromCheckout = redirectTo === '/checkout'

  if (user) return <Navigate to={redirectTo} replace />

  const signIn = async (accountEmail, accountPassword) => {
    setError('')
    setSubmitting(true)
    try {
      await login(accountEmail, accountPassword)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  const onSubmit = (e) => {
    e.preventDefault()
    signIn(email, password)
  }

  return (
    <AuthShell
      title="Bon retour 👋"
      subtitle={fromCheckout ? 'Connectez-vous pour finaliser votre commande. Votre panier est conservé.' : 'Retrouvez votre collection, vos PokéDollars et votre panier.'}
      footer={
        <>
          Pas encore de compte ?{' '}
          <Link to="/register" state={location.state} className="font-semibold text-gold-300 hover:text-gold-200">
            Créer un compte
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="input"
            placeholder="vous@exemple.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Mot de passe" htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className="input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" loading={submitting} className="w-full py-3">
          Se connecter
        </Button>
      </form>

      <div className="mt-8 rounded-2xl border border-dashed border-white/15 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-night-400">Comptes de démonstration</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              disabled={submitting}
              onClick={() => signIn(account.email, account.password)}
              className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5 text-left ring-1 ring-white/10 transition hover:bg-white/10 disabled:opacity-60"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-xs font-bold text-night-950">
                {initials(account.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-white">{account.name}</span>
                <span className="block truncate text-xs text-night-400">{account.email}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-night-400">
          Un clic pour se connecter. Mot de passe : <code className="rounded bg-white/10 px-1 py-0.5 text-night-100">Demo1234</code>
        </p>
      </div>
    </AuthShell>
  )
}
