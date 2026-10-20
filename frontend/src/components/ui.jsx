import { Link } from 'react-router-dom'
import { formatMoney } from '../utils/format.js'
import Icon, { StarIcon } from './Icon.jsx'

const BUTTON_VARIANTS = {
  primary: 'bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700 focus-visible:ring-brand-500/30',
  dark: 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-500/30',
  light: 'bg-white text-slate-900 hover:bg-slate-100 focus-visible:ring-white/40',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 focus-visible:ring-slate-300/50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-300/50',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500/30',
}

const buttonClasses = (variant, className) =>
  `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition
   focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_VARIANTS[variant]} ${className}`

export function Button({ variant = 'primary', loading = false, className = '', children, disabled, ...props }) {
  return (
    <button className={buttonClasses(variant, className)} disabled={disabled || loading} {...props}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
}

export function ButtonLink({ variant = 'primary', className = '', children, ...props }) {
  return (
    <Link className={buttonClasses(variant, className)} {...props}>
      {children}
    </Link>
  )
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  )
}

export function PageSpinner() {
  return (
    <div className="flex justify-center py-24 text-brand-600">
      <Spinner className="h-8 w-8" />
    </div>
  )
}

export function Field({ label, hint, htmlFor, children, className = '' }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

const ALERT_TONES = {
  error: { box: 'border-red-200 bg-red-50 text-red-800', icon: 'alert' },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: 'check' },
  info: { box: 'border-brand-200 bg-brand-50 text-brand-900', icon: 'alert' },
}

export function Alert({ tone = 'error', children }) {
  const t = ALERT_TONES[tone]
  return (
    <div role="alert" className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${t.box}`}>
      <Icon name={t.icon} className="mt-0.5 h-5 w-5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

export function Price({ price, compareAt, size = 'md' }) {
  const sizes = { sm: 'text-sm', md: 'text-base', lg: 'text-3xl' }
  const onSale = compareAt && Number(compareAt) > Number(price)
  return (
    <div className="flex items-baseline gap-2">
      <span className={`font-semibold tabular-nums ${sizes[size]} ${onSale ? 'text-rose-600' : 'text-slate-900'}`}>
        {formatMoney(price)}
      </span>
      {onSale && <span className="text-sm tabular-nums text-slate-400 line-through">{formatMoney(compareAt)}</span>}
    </div>
  )
}

export function Stars({ rating, count, className = '' }) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <div className="flex text-amber-400" aria-label={`Note : ${rating} sur 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <StarIcon key={i} className={`h-3.5 w-3.5 ${rating >= i - 0.25 ? '' : 'text-slate-200'}`} />
        ))}
      </div>
      <span className="text-xs text-slate-500">
        {rating.toFixed(1).replace('.', ',')}
        {count != null && ` (${count})`}
      </span>
    </div>
  )
}

export function QuantityStepper({ value, onChange, min = 1, max = 10, disabled = false }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        aria-label="Diminuer la quantité"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        className="p-2.5 text-slate-500 transition hover:text-slate-900 disabled:opacity-30"
      >
        <Icon name="minus" className="h-4 w-4" />
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="Augmenter la quantité"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className="p-2.5 text-slate-500 transition hover:text-slate-900 disabled:opacity-30"
      >
        <Icon name="plus" className="h-4 w-4" />
      </button>
    </div>
  )
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon name={icon} className="h-8 w-8" />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-slate-900">{title}</h2>
      {children && <p className="mt-2 max-w-sm text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function StatusBadge({ status, meta }) {
  const m = meta[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${m.className}`}>
      {m.label}
    </span>
  )
}
