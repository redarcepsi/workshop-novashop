import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { shopApi } from '../api.js'
import Icon from '../components/Icon.jsx'
import ProductVisual from '../components/ProductVisual.jsx'
import { Alert, Button, ButtonLink, EmptyState, PageSpinner, StatusBadge } from '../components/ui.jsx'
import { ORDER_STATUS, estimatedDelivery, formatDateTime, formatMoney, plural } from '../utils/format.js'

function InfoCard({ icon, title, children }) {
  return (
    <div className="card p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Icon name={icon} className="h-5 w-5 text-slate-400" /> {title}
      </h3>
      <div className="mt-3 text-sm leading-relaxed text-slate-600">{children}</div>
    </div>
  )
}

export default function OrderDetail() {
  const { id } = useParams()
  const location = useLocation()
  const justOrdered = location.state?.justOrdered
  const [order, setOrder] = useState(undefined)
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    shopApi
      .order(id)
      .then(setOrder)
      .catch(() => setOrder(null))
  }, [id])

  if (order === undefined) return <PageSpinner />
  if (order === null) {
    return (
      <div className="container-page">
        <EmptyState icon="box" title="Commande introuvable" action={<ButtonLink to="/orders">Mes commandes</ButtonLink>} />
      </div>
    )
  }

  const cancel = async () => {
    setError('')
    setCancelling(true)
    try {
      setOrder(await shopApi.cancelOrder(order.id))
      setConfirming(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setCancelling(false)
    }
  }

  const isPaid = order.status === 'PAID'

  return (
    <div className="container-page max-w-5xl py-10">
      {justOrdered && isPaid && (
        <div className="mb-10 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-50 via-white to-brand-50 p-8 text-center ring-1 ring-emerald-100">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Icon name="check" className="h-9 w-9" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Merci pour votre commande !</h1>
          <p className="mt-2 text-slate-600">
            La commande <strong>{order.number}</strong> est confirmée et sera livrée vers le{' '}
            <strong>{estimatedDelivery(order.created_at)}</strong>.
          </p>
        </div>
      )}

      <Link to="/orders" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <Icon name="arrowLeft" className="h-4 w-4" /> Mes commandes
      </Link>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Commande {order.number}</h2>
            <StatusBadge status={order.status} meta={ORDER_STATUS} />
          </div>
          <p className="mt-1 text-sm text-slate-500">Passée le {formatDateTime(order.created_at)}</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card divide-y divide-slate-100">
            <h3 className="px-6 py-4 text-sm font-semibold text-slate-900">{plural(order.items_count, 'article')}</h3>
            {order.items.map((item) => {
              const content = (
                <>
                  <ProductVisual item={item} size="xs" className="h-16 w-16 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{item.product_name}</p>
                    <p className="text-sm tabular-nums text-slate-500">
                      {item.quantity} × {formatMoney(item.unit_price)}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums text-slate-900">{formatMoney(item.line_total)}</p>
                </>
              )
              return item.product_id ? (
                <Link key={item.product_slug} to={`/products/${item.product_slug}`} className="group flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60">
                  {content}
                </Link>
              ) : (
                <div key={item.product_slug} className="flex items-center gap-4 px-6 py-4">
                  {content}
                </div>
              )
            })}
            <dl className="space-y-2 px-6 py-5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Sous-total</dt>
                <dd className="tabular-nums">{formatMoney(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Livraison</dt>
                <dd className="tabular-nums">
                  {Number(order.shipping_cost) === 0 ? <span className="text-emerald-600">Offerte</span> : formatMoney(order.shipping_cost)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-3 text-base font-semibold text-slate-900">
                <dt>Total payé</dt>
                <dd className="tabular-nums">{formatMoney(order.total)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="space-y-4">
          <InfoCard icon="pin" title="Livraison">
            <p className="font-medium text-slate-900">{order.shipping_name}</p>
            <p>{order.shipping_address}</p>
            <p>
              {order.shipping_postal_code} {order.shipping_city}
            </p>
            <p>{order.shipping_country}</p>
            {isPaid && <p className="mt-3 text-emerald-700">Livraison estimée : {estimatedDelivery(order.created_at)}</p>}
          </InfoCard>

          <InfoCard icon="card" title="Paiement">
            <p>Carte •••• {order.card_last4}</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-400">{order.payment_reference}</p>
            {!isPaid && order.cancelled_at && (
              <p className="mt-3 text-slate-700">Remboursée le {formatDateTime(order.cancelled_at)}</p>
            )}
          </InfoCard>

          {isPaid && (
            <div className="card p-5">
              {error && <div className="mb-3"><Alert>{error}</Alert></div>}
              {confirming ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-700">Annuler cette commande ? Vous serez remboursé(e) et les articles remis en stock.</p>
                  <div className="flex gap-2">
                    <Button variant="danger" loading={cancelling} onClick={cancel} className="flex-1">
                      Oui, annuler
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirming(false)} className="flex-1">
                      Non
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="secondary" onClick={() => setConfirming(true)} className="w-full">
                  Annuler la commande
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
