"""Collection de cartes : ce que possède chaque utilisateur, alimenté par ses commandes et ses boosters."""

import uuid
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .models import Card, CardSet, CollectionItem, Product


def owned_ids(db: Session, user_id: uuid.UUID, card_ids) -> set[str]:
    return set(
        db.scalars(select(CollectionItem.card_id).where(CollectionItem.user_id == user_id, CollectionItem.card_id.in_(card_ids)))
    )


def add(db: Session, user_id: uuid.UUID, counts: Counter) -> None:
    """Ajoute des exemplaires (une seule requête, sans risque de doublon même en cas d'appels simultanés)."""
    if not counts:
        return
    now = datetime.now(timezone.utc)
    stmt = insert(CollectionItem).values(
        [
            {"user_id": user_id, "card_id": card_id, "quantity": quantity, "first_obtained_at": now, "last_obtained_at": now}
            for card_id, quantity in counts.items()
        ]
    )
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=["user_id", "card_id"],
            set_={"quantity": CollectionItem.quantity + stmt.excluded.quantity, "last_obtained_at": now},
        )
    )


def lock_for_removal(db: Session, user_id: uuid.UUID, counts: Counter) -> dict[str, CollectionItem]:
    """Verrouille les cartes à reprendre ; 409 s'il en manque (rien n'est encore modifié)."""
    rows = {
        row.card_id: row
        for row in db.scalars(
            select(CollectionItem)
            .where(CollectionItem.user_id == user_id, CollectionItem.card_id.in_(counts))
            .order_by(CollectionItem.card_id)
            .with_for_update(of=CollectionItem)
        )
    }
    missing = [card_id for card_id, quantity in counts.items() if card_id not in rows or rows[card_id].quantity < quantity]
    if missing:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Certaines cartes de cette commande ne sont plus dans votre collection"
        )
    return rows


def remove(db: Session, rows: dict[str, CollectionItem], counts: Counter) -> None:
    for card_id, quantity in counts.items():
        row = rows[card_id]
        if row.quantity == quantity:
            db.delete(row)
        else:
            row.quantity -= quantity


def summary(db: Session, user_id: uuid.UUID) -> dict:
    items = db.scalars(
        select(CollectionItem)
        .join(Card, CollectionItem.card_id == Card.id)
        .join(CardSet, Card.set_id == CardSet.id)
        .where(CollectionItem.user_id == user_id)
        .order_by(CardSet.position, Card.number)
    ).all()

    prices = dict(
        db.execute(select(Product.card_id, Product.price).where(Product.card_id.in_([i.card_id for i in items]))).all()
    )
    owned_by_set = Counter(item.card.set_id for item in items)
    sets = db.execute(
        select(CardSet, func.count(Card.id))
        .join(Card, Card.set_id == CardSet.id)
        .group_by(CardSet.id)
        .order_by(CardSet.position)
    ).all()

    return {
        "distinct": len(items),
        "copies": sum(item.quantity for item in items),
        "total": sum(count for _, count in sets),
        "value": sum((prices.get(item.card_id, Decimal("0")) * item.quantity for item in items), Decimal("0.00")),
        "sets": [
            {"id": s.id, "name": s.name, "logo_url": s.logo_url, "owned": owned_by_set[s.id], "total": count}
            for s, count in sets
        ],
        "items": items,
    }
