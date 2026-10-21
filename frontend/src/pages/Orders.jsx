import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { shopApi } from '../api.js'
import Icon from '../components/Icon.jsx'
import { ProductThumb } from '../components/ProductCard.jsx'
import { Alert, ButtonLink, EmptyState, PD, PageSpinner, StatusBadge } from '../components/ui.jsx'
import { ORDER_STATUS, formatDate, formatMoney, plural } from '../utils/format.js'

export default function Orders() {
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    shopApi
      .orders()
      .then(setOrders)
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div className="container-page max-w-4xl py-10">
      <h1 className="font-display text-4xl font-bold tracking-tight text-white">Mes commandes</h1>
      <p className="mt-1 text-sm text-night-400">Vos achats de cartes et de PokéDollars, payés par carte bancaire.</p>

      <div className="mt-8">
        {error && <Alert>{error}</Alert>}
        {!orders && !error && <PageSpinner />}

        {orders?.length === 0 && (
          <EmptyState icon="box" title="Aucune commande pour l’instant" action={<ButtonLink to="/cards">Commencer mes achats</ButtonLink>}>
            Vos commandes apparaîtront ici dès votre premier achat.
          </EmptyState>
        )}

        <ul className="space-y-4">
          {orders?.map((order) => (
            <li key={order.id}>
              <Link to={`/orders/${order.id}`} className="panel group block p-5 transition hover:border-white/20">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-white">{order.number}</p>
                    <StatusBadge status={order.status} meta={ORDER_STATUS} />
                  </div>
                  <p className="text-sm text-night-400">{formatDate(order.created_at)}</p>
                </div>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    {order.items.slice(0, 5).map((item) => (
                      <ProductThumb key={item.product_slug} item={item} className="h-14 w-10" />
                    ))}
                    {order.items.length > 5 && (
                      <span className="flex h-14 w-10 items-center justify-center rounded-md bg-white/5 text-xs font-semibold text-night-300">
                        +{order.items.length - 5}
                      </span>
                    )}
                    <span className="ml-2 hidden text-sm text-night-400 sm:inline">
                      {plural(order.items_count, 'article')}
                      {order.pokedollars > 0 && (
                        <>
                          {' '}· <PD amount={order.pokedollars} className="text-gold-200" />
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-semibold tabular-nums text-white">{formatMoney(order.total)}</p>
                    <Icon name="chevronRight" className="h-5 w-5 text-night-500 transition group-hover:translate-x-0.5 group-hover:text-night-200" />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
