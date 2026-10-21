import { useId } from 'react'
import { Link } from 'react-router-dom'
import { RARITIES } from '../utils/cards.js'
import { formatMoney, formatNumber } from '../utils/format.js'
import Icon from './Icon.jsx'

const BUTTON_VARIANTS = {
  primary:
    'bg-gradient-to-b from-gold-300 to-gold-500 text-night-950 shadow-lg shadow-gold-500/25 hover:from-gold-200 hover:to-gold-400 focus-visible:ring-gold-400/40',
  dark: 'bg-white text-night-950 hover:bg-night-100 focus-visible:ring-white/40',
  secondary: 'border border-white/15 bg-white/5 text-white hover:border-white/25 hover:bg-white/10 focus-visible:ring-white/20',
  ghost: 'text-night-200 hover:bg-white/5 hover:text-white focus-visible:ring-white/20',
  danger: 'bg-red-500 text-white hover:bg-red-400 focus-visible:ring-red-500/30',
}

const buttonClasses = (variant, className) =>
  `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition
   focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`

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
    <div className="flex justify-center py-24 text-gold-400">
      <Spinner className="h-8 w-8" />
    </div>
  )
}

export function Field({ label, hint, htmlFor, children, className = '' }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-night-100">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-night-400">{hint}</p>}
    </div>
  )
}

const ALERT_TONES = {
  error: { box: 'border-red-400/30 bg-red-500/10 text-red-200', icon: 'alert' },
  success: { box: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200', icon: 'check' },
  info: { box: 'border-gold-400/30 bg-gold-400/10 text-gold-100', icon: 'alert' },
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
      <span className={`font-semibold tabular-nums ${sizes[size]} ${onSale ? 'text-rose-300' : 'text-white'}`}>
        {formatMoney(price)}
      </span>
      {onSale && <span className="text-sm tabular-nums text-night-400 line-through">{formatMoney(compareAt)}</span>}
    </div>
  )
}

/** Pièce de PokéDollar. */
export function Coin({ className = 'h-5 w-5', style }) {
  // Identifiant unique : un dégradé partagé disparaît si la première pièce de la page est masquée
  const id = `coin-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2c4" />
          <stop offset=".5" stopColor="#ffc21c" />
          <stop offset="1" stopColor="#d97e00" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="#b45a04" />
      <circle cx="12" cy="11.3" r="10.3" fill={`url(#${id})`} />
      <circle cx="12" cy="11.3" r="7.6" fill="none" stroke="#b45a04" strokeOpacity=".55" strokeWidth="1.1" />
      <path
        d="M9.6 16V7h3.1a2.6 2.6 0 0 1 0 5.2H9.6M8 9.6h6.2M8 12.2h3"
        fill="none"
        stroke="#78390d"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Montant en PokéDollars : pièce + nombre. */
export function PD({ amount, className = '', coinClassName = 'h-[1.15em] w-[1.15em]' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold tabular-nums ${className}`}>
      <Coin className={`shrink-0 ${coinClassName}`} />
      {formatNumber(amount)}
      <span className="sr-only"> PokéDollars</span>
    </span>
  )
}

export function RarityBadge({ rarity, label, className = '' }) {
  const r = RARITIES[rarity]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${r.badge} ${className}`}
      title={label ?? r.label}
    >
      <span aria-hidden="true">{r.symbol}</span> {label ?? r.label}
    </span>
  )
}

export function QuantityStepper({ value, onChange, min = 1, max = 10, disabled = false }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-white/15 bg-white/5">
      <button
        type="button"
        aria-label="Diminuer la quantité"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        className="p-2.5 text-night-300 transition hover:text-white disabled:opacity-30"
      >
        <Icon name="minus" className="h-4 w-4" />
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="Augmenter la quantité"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className="p-2.5 text-night-300 transition hover:text-white disabled:opacity-30"
      >
        <Icon name="plus" className="h-4 w-4" />
      </button>
    </div>
  )
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-night-300 ring-1 ring-white/10">
        <Icon name={icon} className="h-8 w-8" />
      </span>
      <h2 className="mt-5 font-display text-xl font-semibold text-white">{title}</h2>
      {children && <p className="mt-2 max-w-sm text-sm text-night-300">{children}</p>}
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

export function SectionHeader({ title, subtitle, link, linkLabel = 'Tout voir', eyebrow }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">{eyebrow}</p>}
        <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
        {subtitle && <p className="mt-2 max-w-2xl text-night-300">{subtitle}</p>}
      </div>
      {link && (
        <Link to={link} className="flex items-center gap-1 text-sm font-semibold text-gold-300 hover:text-gold-200">
          {linkLabel} <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      )}
    </div>
  )
}
