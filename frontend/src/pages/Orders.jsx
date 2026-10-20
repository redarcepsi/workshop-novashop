import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { shopApi } from '../api.js'
import Icon from '../components/Icon.jsx'
import ProductVisual from '../components/ProductVisual.jsx'
import { Alert, ButtonLink, EmptyState, PageSpinner, StatusBadge } from '../components/ui.jsx'
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
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Mes commandes</h1>
      <p className="mt-1 text-sm text-slate-500">Suivez vos achats et retrouvez leur détail.</p>

      <div className="mt-8">
        {error && <Alert>{error}</Alert>}
        {!orders && !error && <PageSpinner />}

        {orders?.length === 0 && (
          <EmptyState icon="box" title="Aucune commande pour l’instant" action={<ButtonLink to="/products" variant="dark">Commencer mes achats</ButtonLink>}>
            Vos commandes apparaîtront ici dès votre premier achat.
          </EmptyState>
        )}

        <ul className="space-y-4">
          {orders?.map((order) => (
            <li key={order.id}>
              <Link to={`/orders/${order.id}`} className="card group block p-5 transition hover:border-slate-300 hover:shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-slate-900">{order.number}</p>
                    <StatusBadge status={order.status} meta={ORDER_STATUS} />
                  </div>
                  <p className="text-sm text-slate-500">{formatDate(order.created_at)}</p>
                </div>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    {order.items.slice(0, 4).map((item) => (
                      <ProductVisual key={item.product_slug} item={item} size="xs" className="h-12 w-12 rounded-xl" />
                    ))}
                    {order.items.length > 4 && (
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-500">
                        +{order.items.length - 4}
                      </span>
                    )}
                    <span className="ml-2 hidden text-sm text-slate-500 sm:inline">{plural(order.items_count, 'article')}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-semibold tabular-nums text-slate-900">{formatMoney(order.total)}</p>
                    <Icon name="chevronRight" className="h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
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
