import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { shopApi } from '../api.js'
import Icon from '../components/Icon.jsx'
import { ProductThumb } from '../components/ProductCard.jsx'
import { Alert, Button, ButtonLink, EmptyState, PD, PageSpinner, StatusBadge } from '../components/ui.jsx'
import { useWallet } from '../context/WalletContext.jsx'
import { ORDER_STATUS, formatDateTime, formatMoney, formatPD, plural } from '../utils/format.js'

function InfoCard({ icon, title, children }) {
  return (
    <div className="panel p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
        <Icon name={icon} className="h-5 w-5 text-gold-300" /> {title}
      </h3>
      <div className="mt-3 text-sm leading-relaxed text-night-300">{children}</div>
    </div>
  )
}

export default function OrderDetail() {
  const { id } = useParams()
  const location = useLocation()
  const justOrdered = location.state?.justOrdered
  const wallet = useWallet()
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
      wallet.refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setCancelling(false)
    }
  }

  const isPaid = order.status === 'PAID'
  const cards = order.items.filter((i) => i.kind === 'CARD').reduce((n, i) => n + i.quantity, 0)

  return (
    <div className="container-page max-w-5xl py-10">
      {justOrdered && isPaid && (
        <div className="relative mb-10 overflow-hidden rounded-3xl border border-gold-300/30 bg-gradient-to-br from-gold-400/15 via-night-900 to-violet-500/15 p-8 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gold-400 text-night-950 shadow-lg shadow-gold-500/30">
            <Icon name="check" className="h-9 w-9" />
          </span>
          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-white">Paiement accepté !</h1>
          <p className="mt-2 text-night-200">
            Commande <strong className="text-white">{order.number}</strong> livrée à l’instant :
            {cards > 0 && <> {plural(cards, 'carte ajoutée', 'cartes ajoutées')} à votre collection</>}
            {cards > 0 && order.pokedollars > 0 && ' et'}
            {order.pokedollars > 0 && <> {formatPD(order.pokedollars)} crédités</>}.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {order.pokedollars > 0 && (
              <ButtonLink to="/boosters">
                <Icon name="gift" className="h-4 w-4" /> Ouvrir un booster
              </ButtonLink>
            )}
            {cards > 0 && (
              <ButtonLink to="/collection" variant={order.pokedollars > 0 ? 'secondary' : 'primary'}>
                <Icon name="grid" className="h-4 w-4" /> Voir ma collection
              </ButtonLink>
            )}
          </div>
        </div>
      )}

      <Link to="/orders" className="mb-6 inline-flex items-center gap-1.5 text-sm text-night-400 hover:text-white">
        <Icon name="arrowLeft" className="h-4 w-4" /> Mes commandes
      </Link>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-3xl font-bold tracking-tight text-white">Commande {order.number}</h2>
            <StatusBadge status={order.status} meta={ORDER_STATUS} />
          </div>
          <p className="mt-1 text-sm text-night-400">Passée le {formatDateTime(order.created_at)}</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="panel divide-y divide-white/10">
            <h3 className="px-6 py-4 text-sm font-semibold text-white">{plural(order.items_count, 'article')}</h3>
            {order.items.map((item) => {
              const content = (
                <>
                  <ProductThumb item={item} className="h-16 w-12" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{item.product_name}</p>
                    <p className="text-sm tabular-nums text-night-400">
                      {item.quantity} × {formatMoney(item.unit_price)}
                      {item.kind === 'POKEDOLLARS' && (
                        <>
                          {' '}· <PD amount={item.pokedollars * item.quantity} className="text-gold-200" />
                        </>
                      )}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums text-white">{formatMoney(item.line_total)}</p>
                </>
              )
              const to = item.kind === 'CARD' ? `/cards/${item.product_slug}` : '/pokedollars'
              return item.product_id ? (
                <Link key={item.product_slug} to={to} className="flex items-center gap-4 px-6 py-4 hover:bg-white/5">
                  {content}
                </Link>
              ) : (
                <div key={item.product_slug} className="flex items-center gap-4 px-6 py-4">
                  {content}
                </div>
              )
            })}
            <dl className="px-6 py-5 text-sm">
              <div className="flex justify-between text-base font-semibold text-white">
                <dt>Total payé</dt>
                <dd className="tabular-nums">{formatMoney(order.total)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="space-y-4">
          <InfoCard icon="bolt" title="Livraison">
            {isPaid ? (
              <>
                <p className="text-white">Instantanée, 100 % numérique</p>
                {cards > 0 && <p>{plural(cards, 'carte', 'cartes')} dans votre collection</p>}
                {order.pokedollars > 0 && <p>{formatPD(order.pokedollars)} crédités</p>}
              </>
            ) : (
              <p>Cartes et PokéDollars repris lors de l’annulation.</p>
            )}
          </InfoCard>

          <InfoCard icon="card" title="Paiement">
            <p>Carte •••• {order.card_last4}</p>
            <p className="mt-1 break-all font-mono text-xs text-night-500">{order.payment_reference}</p>
            {!isPaid && order.cancelled_at && <p className="mt-3 text-night-100">Remboursée le {formatDateTime(order.cancelled_at)}</p>}
          </InfoCard>

          {isPaid && (
            <div className="panel p-5">
              {error && (
                <div className="mb-3">
                  <Alert>{error}</Alert>
                </div>
              )}
              {confirming ? (
                <div className="space-y-3">
                  <p className="text-sm text-night-200">
                    Annuler cette commande ? Vous serez remboursé(e) ; les cartes achetées quitteront votre collection
                    et les PokéDollars seront repris.
                  </p>
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
