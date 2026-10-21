import { formatMoney, plural } from '../utils/format.js'
import Icon from './Icon.jsx'
import { PD } from './ui.jsx'

/** Récapitulatif du panier (montants calculés par le serveur) et de ce qui sera livré au paiement. */
export default function CartSummary({ cart, children }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2 rounded-xl bg-white/5 p-4 text-sm ring-1 ring-white/10">
        <p className="flex items-center gap-2 font-medium text-night-100">
          <Icon name="bolt" className="h-5 w-5 text-gold-300" /> Livraison instantanée, 100 % numérique
        </p>
        {cart.cards_count > 0 && (
          <p className="pl-7 text-night-300">{plural(cart.cards_count, 'carte ajoutée', 'cartes ajoutées')} à votre collection</p>
        )}
        {cart.pokedollars > 0 && (
          <p className="pl-7 text-night-300">
            <PD amount={cart.pokedollars} className="text-gold-200" /> crédités sur votre porte-monnaie
          </p>
        )}
      </div>

      <dl className="space-y-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-night-300">Articles</dt>
          <dd className="font-medium tabular-nums text-white">{cart.items_count}</dd>
        </div>
        <div className="flex justify-between border-t border-white/10 pt-3 text-base">
          <dt className="font-semibold text-white">Total TTC</dt>
          <dd className="font-bold tabular-nums text-white">{formatMoney(cart.total)}</dd>
        </div>
      </dl>

      {children}
    </div>
  )
}
