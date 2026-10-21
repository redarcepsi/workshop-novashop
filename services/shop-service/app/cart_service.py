"""Logique du panier. Le prix et le stock viennent toujours de la base, jamais du client."""

import uuid
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import settings
from .models import CartItem, Product, ProductKind
from .schemas import CartItemIn

CENT = Decimal("0.01")


def has_stock(product: Product, quantity: int) -> bool:
    return product.stock is None or product.stock >= quantity


def build_cart(lines: list[tuple[Product, int]]) -> dict:
    """Calcule les totaux d'un panier à partir de (produit, quantité)."""
    items = []
    total = Decimal("0.00")
    for product, quantity in lines:
        line_total = (product.price * quantity).quantize(CENT)
        total += line_total
        items.append(
            {"product": product, "quantity": quantity, "line_total": line_total, "available": has_stock(product, quantity)}
        )

    return {
        "items": items,
        "items_count": sum(q for _, q in lines),
        "total": total,
        "pokedollars": sum(p.pokedollars * q for p, q in lines if p.kind == ProductKind.POKEDOLLARS),
        "cards_count": sum(q for p, q in lines if p.kind == ProductKind.CARD),
    }


def _get_product(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produit introuvable")
    return product


def _get_line(db: Session, user_id: uuid.UUID, product_id: int) -> CartItem | None:
    return db.scalar(select(CartItem).where(CartItem.user_id == user_id, CartItem.product_id == product_id))


def _check_quantity(product: Product, quantity: int) -> None:
    if quantity > settings.max_quantity_per_item:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Maximum {settings.max_quantity_per_item} exemplaires par article"
        )
    if not has_stock(product, quantity):
        detail = (
            f"Stock insuffisant pour « {product.name} » : plus que {product.stock} exemplaire(s)"
            if product.stock
            else f"« {product.name} » est en rupture de stock"
        )
        raise HTTPException(status.HTTP_409_CONFLICT, detail)


def get_cart(db: Session, user_id: uuid.UUID) -> dict:
    rows = db.scalars(select(CartItem).where(CartItem.user_id == user_id).order_by(CartItem.added_at)).all()
    return build_cart([(row.product, row.quantity) for row in rows])


def add_item(db: Session, user_id: uuid.UUID, product_id: int, quantity: int) -> dict:
    product = _get_product(db, product_id)
    line = _get_line(db, user_id, product_id)
    new_quantity = (line.quantity if line else 0) + quantity
    _check_quantity(product, new_quantity)

    if line:
        line.quantity = new_quantity
    else:
        db.add(CartItem(user_id=user_id, product_id=product_id, quantity=new_quantity))
    db.commit()
    return get_cart(db, user_id)


def set_quantity(db: Session, user_id: uuid.UUID, product_id: int, quantity: int) -> dict:
    line = _get_line(db, user_id, product_id)
    if line is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cet article n'est pas dans votre panier")
    _check_quantity(line.product, quantity)
    line.quantity = quantity
    db.commit()
    return get_cart(db, user_id)


def remove_item(db: Session, user_id: uuid.UUID, product_id: int) -> dict:
    db.execute(delete(CartItem).where(CartItem.user_id == user_id, CartItem.product_id == product_id))
    db.commit()
    return get_cart(db, user_id)


def clear(db: Session, user_id: uuid.UUID) -> dict:
    db.execute(delete(CartItem).where(CartItem.user_id == user_id))
    db.commit()
    return get_cart(db, user_id)


def merge(db: Session, user_id: uuid.UUID, items: list[CartItemIn]) -> dict:
    """Fusionne un panier invité dans le panier du compte, en plafonnant au stock disponible."""
    for item in items:
        product = db.get(Product, item.product_id)
        if product is None or product.stock == 0:
            continue
        line = _get_line(db, user_id, item.product_id)
        quantity = min((line.quantity if line else 0) + item.quantity, settings.max_quantity_per_item)
        if product.stock is not None:
            quantity = min(quantity, product.stock)
        if line:
            line.quantity = quantity
        else:
            db.add(CartItem(user_id=user_id, product_id=item.product_id, quantity=quantity))
            db.flush()
    db.commit()
    return get_cart(db, user_id)


def quote(db: Session, items: list[CartItemIn]) -> dict:
    """Chiffre un panier invité (non connecté) avec les prix et stocks réels."""
    quantities: dict[int, int] = {}
    for item in items:
        quantities[item.product_id] = quantities.get(item.product_id, 0) + item.quantity

    products = {p.id: p for p in db.scalars(select(Product).where(Product.id.in_(quantities))).all()}
    return build_cart([(products[pid], qty) for pid, qty in quantities.items() if pid in products])
