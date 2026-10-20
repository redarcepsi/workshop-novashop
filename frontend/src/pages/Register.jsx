import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import AuthShell from '../components/AuthShell.jsx'
import { Alert, Button, Field } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const RULES = [
  { test: (p) => p.length >= 8, label: '8 caractères minimum' },
  { test: (p) => /[a-zA-Z]/.test(p), label: 'Une lettre' },
  { test: (p) => /\d/.test(p), label: 'Un chiffre' },
]

export default function Register() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ full_name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = location.state?.from?.pathname || '/'

  if (user) return <Navigate to={redirectTo} replace />

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const passwordOk = RULES.every((r) => r.test(form.password))

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await register(form)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Créer un compte"
      subtitle="Pour passer commande et suivre vos achats. Votre panier actuel sera conservé."
      footer={
        <>
          Déjà inscrit ?{' '}
          <Link to="/login" state={location.state} className="font-semibold text-brand-600 hover:text-brand-700">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <Field label="Nom complet" htmlFor="full_name">
          <input
            id="full_name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
            className="input"
            placeholder="Alice Martin"
            value={form.full_name}
            onChange={update('full_name')}
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="input"
            placeholder="vous@exemple.fr"
            value={form.email}
            onChange={update('email')}
          />
        </Field>
        <Field label="Mot de passe" htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            maxLength={64}
            className="input"
            placeholder="••••••••"
            value={form.password}
            onChange={update('password')}
          />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {RULES.map((r) => {
              const ok = r.test(form.password)
              return (
                <li key={r.label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-emerald-600' : 'text-slate-400'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  {r.label}
                </li>
              )
            })}
          </ul>
        </Field>
        <Button type="submit" loading={submitting} disabled={!passwordOk} variant="dark" className="w-full py-3">
          Créer mon compte
        </Button>
      </form>
    </AuthShell>
  )
}
