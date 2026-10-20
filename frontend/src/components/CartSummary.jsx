import { formatMoney, plural } from '../utils/format.js'
import Icon from './Icon.jsx'

/** Récapitulatif des montants du panier (calculés par le serveur). */
export default function CartSummary({ cart, children }) {
  const remaining = Number(cart.free_shipping_remaining)
  const threshold = Number(cart.free_shipping_threshold)
  const progress = Math.min(100, (Number(cart.subtotal) / threshold) * 100)

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-slate-50 p-4">
        {remaining > 0 ? (
          <>
            <p className="flex items-center gap-2 text-sm text-slate-700">
              <Icon name="truck" className="h-5 w-5 text-brand-600" />
              Plus que <strong className="tabular-nums">{formatMoney(remaining)}</strong> pour la livraison offerte
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <Icon name="truck" className="h-5 w-5" />
            Livraison offerte 🎉
          </p>
        )}
      </div>

      <dl className="space-y-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-600">Sous-total ({plural(cart.items_count, 'article')})</dt>
          <dd className="font-medium tabular-nums text-slate-900">{formatMoney(cart.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-600">Livraison</dt>
          <dd className="font-medium tabular-nums text-slate-900">
            {Number(cart.shipping_cost) === 0 ? <span className="text-emerald-600">Offerte</span> : formatMoney(cart.shipping_cost)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-3 text-base">
          <dt className="font-semibold text-slate-900">Total TTC</dt>
          <dd className="font-bold tabular-nums text-slate-900">{formatMoney(cart.total)}</dd>
        </div>
      </dl>

      {children}
    </div>
  )
}
