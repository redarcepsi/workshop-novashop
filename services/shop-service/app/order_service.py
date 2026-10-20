"""Passage de commande et annulation.

Les produits concernés sont verrouillés (SELECT ... FOR UPDATE, toujours triés par id pour éviter
les interblocages) : deux clients ne peuvent pas acheter le dernier exemplaire en même temps.
Le paiement et le remboursement sont délégués à la plateforme de paiement (voir payment.py).
"""

import logging
import secrets
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import payment
from .cart_service import CENT, shipping_cost_for
from .models import CartItem, Order, OrderItem, OrderStatus, Product
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
    unavailable = [products[line.product_id].name for line in lines if products[line.product_id].stock < line.quantity]
    if unavailable:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, f"Stock insuffisant pour : {', '.join(unavailable)}")

    order_items = []
    subtotal = Decimal("0.00")
    for line in lines:
        product = products[line.product_id]
        line_total = (product.price * line.quantity).quantize(CENT)
        subtotal += line_total
        order_items.append(
            OrderItem(
                product_id=product.id,
                product_slug=product.slug,
                product_name=product.name,
                emoji=product.emoji,
                color=product.color,
                image_url=product.image_url,
                unit_price=product.price,
                quantity=line.quantity,
                line_total=line_total,
            )
        )

    shipping = shipping_cost_for(subtotal)
    total = subtotal + shipping
    number = _order_number()

    try:
        paid = payment.charge(payload.payment, total, number)
    except HTTPException:
        db.rollback()
        raise

    shipping_info = payload.shipping
    order = Order(
        number=number,
        user_id=user.id,
        customer_email=user.email,
        status=OrderStatus.PAID,
        subtotal=subtotal,
        shipping_cost=shipping,
        total=total,
        shipping_name=shipping_info.full_name,
        shipping_address=shipping_info.address,
        shipping_postal_code=shipping_info.postal_code,
        shipping_city=shipping_info.city,
        shipping_country=shipping_info.country,
        card_last4=paid.card_last4,
        payment_reference=paid.reference,
        items=order_items,
    )
    db.add(order)

    for line in lines:
        products[line.product_id].stock -= line.quantity
        db.delete(line)

    try:
        db.commit()
    except Exception:
        # Le client est débité mais la commande n'a pas pu être enregistrée : on le rembourse (compensation)
        db.rollback()
        logger.exception("Commande %s non enregistrée après le paiement %s : remboursement", number, paid.reference)
        try:
            payment.refund(paid.reference)
        except HTTPException:
            logger.error("Remboursement de compensation impossible pour %s : à régulariser", paid.reference)
        raise
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

    # Remboursement d'abord : s'il échoue, la commande reste payée et l'annulation peut être retentée
    try:
        payment.refund(order.payment_reference)
    except HTTPException:
        db.rollback()
        raise

    # Remise en stock (les produits supprimés du catalogue entre-temps sont ignorés)
    product_ids = [item.product_id for item in order.items if item.product_id is not None]
    products = _lock_products(db, product_ids)
    for item in order.items:
        if item.product_id in products:
            products[item.product_id].stock += item.quantity

    order.status = OrderStatus.CANCELLED
    order.cancelled_at = datetime.now(timezone.utc)
    db.commit()
    return order
