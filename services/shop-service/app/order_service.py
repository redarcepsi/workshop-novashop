"""Passage de commande et annulation.

Les produits concernés sont verrouillés (SELECT ... FOR UPDATE, toujours triés par id pour éviter
les interblocages) : deux clients ne peuvent pas acheter le dernier exemplaire en même temps.
Le paiement et le remboursement sont délégués à la plateforme de paiement (voir payment.py).

Tout est numérique : au paiement, les cartes rejoignent la collection et les PokéDollars le porte-monnaie, dans la
même transaction que la commande. L'annulation les reprend, et n'est possible que s'ils n'ont pas été dépensés.
"""

import logging
import secrets
import uuid
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import collection_service, payment, wallet_service
from .cart_service import CENT, has_stock
from .metrics import ORDER_COMPENSATIONS, POKEDOLLARS
from .models import CartItem, Order, OrderItem, OrderStatus, Product, ProductKind, WalletReason
from .schemas import CheckoutRequest
from .security import CurrentUser

logger = logging.getLogger("shop-service")


def _lock_products(db: Session, product_ids) -> dict[int, Product]:
    rows = db.scalars(
        select(Product)
        .where(Product.id.in_(product_ids))
        .order_by(Product.id)
        .with_for_update(of=Product)
        .execution_options(populate_existing=True)
    ).all()
    return {p.id: p for p in rows}


def _order_number() -> str:
    return f"CMD-{datetime.now(timezone.utc):%y%m%d}-{secrets.token_hex(3).upper()}"


def _card_counts(order: Order) -> Counter:
    return Counter({item.card_id: item.quantity for item in order.items if item.kind == ProductKind.CARD})


def checkout(db: Session, user: CurrentUser, payload: CheckoutRequest) -> Order:
    # Verrouille les lignes du panier : un double clic sur "Payer" ne crée pas deux commandes
    lines = db.scalars(
        select(CartItem)
        .where(CartItem.user_id == user.id)
        .order_by(CartItem.added_at)
        .with_for_update(of=CartItem)
    ).all()
    if not lines:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Votre panier est vide")

    products = _lock_products(db, [line.product_id for line in lines])
    unavailable = [products[line.product_id].name for line in lines if not has_stock(products[line.product_id], line.quantity)]
    if unavailable:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, f"Stock insuffisant pour : {', '.join(unavailable)}")

    order_items = []
    total = Decimal("0.00")
    pokedollars = 0
    for line in lines:
        product = products[line.product_id]
        line_total = (product.price * line.quantity).quantize(CENT)
        total += line_total
        if product.kind == ProductKind.POKEDOLLARS:
            pokedollars += product.pokedollars * line.quantity
        order_items.append(
            OrderItem(
                product_id=product.id,
                product_slug=product.slug,
                product_name=product.name,
                kind=product.kind,
                card_id=product.card_id,
                pokedollars=product.pokedollars,
                image_url=product.card.image_url if product.card else None,
                unit_price=product.price,
                quantity=line.quantity,
                line_total=line_total,
            )
        )

    number = _order_number()

    try:
        paid = payment.charge(payload.payment, total, number)
    except HTTPException:
        db.rollback()
        raise

    order = Order(
        number=number,
        user_id=user.id,
        customer_email=user.email,
        status=OrderStatus.PAID,
        total=total,
        pokedollars=pokedollars,
        card_last4=paid.card_last4,
        payment_reference=paid.reference,
        items=order_items,
    )
    db.add(order)

    for line in lines:
        product = products[line.product_id]
        if product.stock is not None:
            product.stock -= line.quantity
        db.delete(line)

    # Livraison immédiate : PokéDollars sur le porte-monnaie, cartes dans la collection
    if pokedollars:
        wallet = wallet_service.lock(db, user.id)
        wallet_service.credit(db, wallet, pokedollars, WalletReason.PURCHASE, reference=number, label=f"Commande {number}")
    collection_service.add(db, user.id, _card_counts(order))

    try:
        db.commit()
    except Exception:
        # Le client est débité mais la commande n'a pas pu être enregistrée : on le rembourse (compensation)
        db.rollback()
        logger.exception("Commande %s non enregistrée après le paiement %s : remboursement", number, paid.reference)
        try:
            payment.refund(paid.reference)
        except HTTPException:
            ORDER_COMPENSATIONS.labels("failed").inc()
            logger.error("Remboursement de compensation impossible pour %s : à régulariser", paid.reference)
        else:
            ORDER_COMPENSATIONS.labels("refunded").inc()
        raise
    if pokedollars:
        POKEDOLLARS.labels("credited").inc(pokedollars)
    return order


def get_user_order(db: Session, user_id: uuid.UUID, order_id: uuid.UUID, *, lock: bool = False) -> Order:
    stmt = select(Order).where(Order.id == order_id, Order.user_id == user_id)
    if lock:
        stmt = stmt.with_for_update()
    order = db.scalar(stmt)
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Commande introuvable")
    return order


def cancel(db: Session, user_id: uuid.UUID, order_id: uuid.UUID) -> Order:
    order = get_user_order(db, user_id, order_id, lock=True)
    if order.status != OrderStatus.PAID:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cette commande est déjà annulée")

    # Vérifie d'abord que tout ce qui a été livré peut être repris : sinon, pas de remboursement
    wallet = None
    if order.pokedollars:
        wallet = wallet_service.lock(db, user_id)
        if wallet.balance < order.pokedollars:
            db.rollback()
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Les PokéDollars de cette commande ont déjà été dépensés : elle ne peut plus être annulée",
            )
    cards = _card_counts(order)
    try:
        owned = collection_service.lock_for_removal(db, user_id, cards)
    except HTTPException:
        db.rollback()
        raise

    # Remboursement ensuite : s'il échoue, la commande reste payée et l'annulation peut être retentée
    try:
        payment.refund(order.payment_reference)
    except HTTPException:
        db.rollback()
        raise

    if wallet is not None:
        wallet_service.debit(
            db, wallet, order.pokedollars, WalletReason.REFUND, reference=order.number,
            label=f"Annulation de la commande {order.number}",
        )
    collection_service.remove(db, owned, cards)

    # Remise en stock (les produits supprimés du catalogue entre-temps sont ignorés)
    product_ids = [item.product_id for item in order.items if item.product_id is not None]
    products = _lock_products(db, product_ids)
    for item in order.items:
        product = products.get(item.product_id)
        if product is not None and product.stock is not None:
            product.stock += item.quantity

    order.status = OrderStatus.CANCELLED
    order.cancelled_at = datetime.now(timezone.utc)
    db.commit()
    if order.pokedollars:
        POKEDOLLARS.labels("revoked").inc(order.pokedollars)
    return order
