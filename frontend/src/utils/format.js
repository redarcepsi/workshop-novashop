const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const integer = new Intl.NumberFormat('fr-FR')
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 })
const longDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })
const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

// L'API renvoie les montants en chaînes ("129.00") pour ne pas perdre en précision
export const formatMoney = (value) => currency.format(Number(value ?? 0))

export const formatNumber = (value) => integer.format(value ?? 0)

export const formatPD = (value) => `${integer.format(value ?? 0)} PokéDollars`

/** Probabilité : « 33,3 % », « < 0,1 % », « 100 % ». */
export const formatChance = (p) => (p >= 1 ? '100 %' : p > 0 && p < 0.001 ? '< 0,1 %' : percent.format(p))

/** Probabilité en fréquence : « 1 booster sur 44 ». */
export const formatOneIn = (p) => (p >= 0.5 ? null : `1 booster sur ${integer.format(Math.round(1 / p))}`)

export const formatDate = (iso) => longDate.format(new Date(iso))

export const formatDateTime = (iso) => dateTime.format(new Date(iso))

export const plural = (count, singular, pluralForm = `${singular}s`) =>
  `${formatNumber(count)} ${count > 1 ? pluralForm : singular}`

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')

export const ORDER_STATUS = {
  PAID: { label: 'Payée', className: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30' },
  CANCELLED: { label: 'Annulée', className: 'bg-white/5 text-night-300 ring-white/15' },
}

export const formatCardNumber = (v) =>
  v
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim()

export const formatExpiry = (v) => {
  const digits = v.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}
