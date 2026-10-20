"""Cycle de vie d'une transaction : création idempotente, autorisation, capture et remboursement."""

import logging
import secrets

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import processor
from .models import Merchant, Transaction, TransactionStatus
from .schemas import PaymentCreate

logger = logging.getLogger("payment-service")


def _reference() -> str:
    return "PAY_" + secrets.token_hex(8).upper()


def _log(tx: Transaction) -> None:
    # Une ligne clé=valeur par opération : facile à filtrer dans Loki / le SIEM
    logger.info(
        "transaction reference=%s merchant=%s merchant_reference=%s status=%s amount=%s currency=%s decline_code=%s",
        tx.reference, tx.merchant.code, tx.merchant_reference, tx.status.value, tx.amount, tx.currency,
        tx.decline_code or "-",
    )


def _by_idempotency_key(db: Session, merchant: Merchant, key: str) -> Transaction | None:
    return db.scalar(
        select(Transaction).where(Transaction.merchant_id == merchant.id, Transaction.idempotency_key == key)
    )


def _replay(tx: Transaction, payload: PaymentCreate) -> Transaction:
    """Renvoie la transaction déjà créée avec cette clé, à condition que la demande soit la même."""
    if (tx.amount, tx.currency, tx.merchant_reference) != (payload.amount, payload.currency, payload.merchant_reference):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cette clé d'idempotence a déjà servi pour un autre paiement")
    return tx


def create(db: Session, merchant: Merchant, payload: PaymentCreate, idempotency_key: str | None) -> tuple[Transaction, bool]:
    """
    Autorise puis capture le paiement, en une seule transaction SQL. Retourne `(transaction, rejouée)`.

    Avec une clé d'idempotence, une requête répétée (nouvelle tentative après un délai dépassé, double envoi…)
    renvoie la transaction d'origine au lieu de débiter une seconde fois.
    """
    if idempotency_key:
        existing = _by_idempotency_key(db, merchant, idempotency_key)
        if existing is not None:
            return _replay(existing, payload), True

    card = payload.card
    tx = Transaction(
        reference=_reference(),
        merchant=merchant,
        merchant_reference=payload.merchant_reference,
        idempotency_key=idempotency_key,
        amount=payload.amount,
        currency=payload.currency,
        card_brand=processor.card_brand(card.number),
        card_last4=card.number[-4:],
    )
    tx.record(TransactionStatus.PENDING, f"Demande reçue de {merchant.name}")

    decision = processor.authorize(card.number, card.expiry)
    if decision.approved:
        tx.record(TransactionStatus.AUTHORIZED, "Autorisée par la banque émettrice")
        tx.record(TransactionStatus.CAPTURED, "Fonds capturés")
    else:
        tx.decline_code, tx.decline_message = decision.code, decision.message
        tx.record(TransactionStatus.DECLINED, decision.message)

    db.add(tx)
    try:
        db.commit()
    except IntegrityError:
        # La même clé est arrivée deux fois en parallèle : l'autre requête l'a enregistrée avant nous
        db.rollback()
        existing = _by_idempotency_key(db, merchant, idempotency_key) if idempotency_key else None
        if existing is None:
            raise
        return _replay(existing, payload), True

    _log(tx)
    return tx, False


def get(db: Session, merchant: Merchant, reference: str, *, lock: bool = False) -> Transaction:
    stmt = select(Transaction).where(Transaction.reference == reference, Transaction.merchant_id == merchant.id)
    if lock:
        stmt = stmt.with_for_update(of=Transaction)
    tx = db.scalar(stmt)
    if tx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction introuvable")
    return tx


def refund(db: Session, merchant: Merchant, reference: str) -> Transaction:
    """Remboursement intégral. Idempotent : rembourser une transaction déjà remboursée la renvoie telle quelle."""
    tx = get(db, merchant, reference, lock=True)
    if tx.status is TransactionStatus.REFUNDED:
        return tx
    if tx.status is not TransactionStatus.CAPTURED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Seule une transaction capturée peut être remboursée")

    tx.record(TransactionStatus.REFUNDED, f"Remboursement demandé par {merchant.name}")
    db.commit()
    _log(tx)
    return tx
