"""Porte-monnaie de PokéDollars : un solde par utilisateur et le journal de ses mouvements.

Le solde n'est modifié qu'ici, ligne verrouillée (SELECT ... FOR UPDATE) : deux ouvertures de booster simultanées
ne peuvent pas dépenser deux fois les mêmes PokéDollars, et la base refuse un solde négatif. Les appelants valident
la transaction, puis comptent le mouvement dans la métrique shop_pokedollars_total.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .models import Wallet, WalletEntry, WalletReason


def format_pd(amount: int) -> str:
    return f"{amount:,}".replace(",", " ") + " PokéDollars"


def lock(db: Session, user_id: uuid.UUID) -> Wallet:
    """Le porte-monnaie de l'utilisateur, créé au besoin et verrouillé jusqu'à la fin de la transaction."""
    db.execute(insert(Wallet).values(user_id=user_id, balance=0).on_conflict_do_nothing(index_elements=["user_id"]))
    return db.scalar(
        select(Wallet).where(Wallet.user_id == user_id).with_for_update().execution_options(populate_existing=True)
    )


def credit(db: Session, wallet: Wallet, amount: int, reason: WalletReason, reference: str, label: str) -> None:
    wallet.balance += amount
    db.add(WalletEntry(user_id=wallet.user_id, amount=amount, balance_after=wallet.balance, reason=reason,
                       reference=reference, label=label))


def debit(db: Session, wallet: Wallet, amount: int, reason: WalletReason, reference: str, label: str) -> None:
    if wallet.balance < amount:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Solde insuffisant : il vous manque {format_pd(amount - wallet.balance)}",
        )
    wallet.balance -= amount
    db.add(WalletEntry(user_id=wallet.user_id, amount=-amount, balance_after=wallet.balance, reason=reason,
                       reference=reference, label=label))


def summary(db: Session, user_id: uuid.UUID) -> dict:
    wallet = db.get(Wallet, user_id)
    entries = db.scalars(
        select(WalletEntry)
        .where(WalletEntry.user_id == user_id)
        .order_by(WalletEntry.created_at.desc(), WalletEntry.id.desc())
        .limit(30)
    ).all()
    return {"balance": wallet.balance if wallet else 0, "entries": entries}
