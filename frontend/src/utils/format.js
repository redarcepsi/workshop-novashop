const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const longDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })
const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
const weekdayDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

// L'API renvoie les montants en chaînes ("129.00") pour ne pas perdre en précision
export const formatMoney = (value) => currency.format(Number(value ?? 0))

export const formatDate = (iso) => longDate.format(new Date(iso))

export const formatDateTime = (iso) => dateTime.format(new Date(iso))

/** Date de livraison estimée : n jours ouvrés après la commande. */
export const estimatedDelivery = (iso, businessDays = 3) => {
  const d = new Date(iso)
  let added = 0
  while (added < businessDays) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) added++
  }
  return weekdayDate.format(d)
}

export const plural = (count, singular, pluralForm = `${singular}s`) =>
  `${count} ${count > 1 ? pluralForm : singular}`

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')

export const ORDER_STATUS = {
  PAID: { label: 'Confirmée', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  CANCELLED: { label: 'Annulée', className: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
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
