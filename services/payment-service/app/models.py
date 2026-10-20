import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Merchant(Base):
    """Client de la plateforme (ex. NovaShop). Il s'authentifie par clé API, dont seul le hash est stocké."""

    __tablename__ = "merchants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    api_key_hash: Mapped[str] = mapped_column(String(64), unique=True)  # SHA-256 en hexadécimal
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class TransactionStatus(str, enum.Enum):
    PENDING = "PENDING"        # reçue, en cours de traitement
    AUTHORIZED = "AUTHORIZED"  # acceptée par la banque émettrice (fictive)
    CAPTURED = "CAPTURED"      # fonds prélevés : paiement terminé
    DECLINED = "DECLINED"      # refusée par la banque émettrice
    REFUNDED = "REFUNDED"      # remboursée intégralement


# Transitions autorisées : toute autre transition est un bug, pas une donnée à enregistrer
_TRANSITIONS = {
    None: {TransactionStatus.PENDING},
    TransactionStatus.PENDING: {TransactionStatus.AUTHORIZED, TransactionStatus.DECLINED},
    TransactionStatus.AUTHORIZED: {TransactionStatus.CAPTURED},
    TransactionStatus.CAPTURED: {TransactionStatus.REFUNDED},
    TransactionStatus.DECLINED: set(),
    TransactionStatus.REFUNDED: set(),
}


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        # Une même clé d'idempotence ne peut produire qu'un seul paiement par marchand
        UniqueConstraint("merchant_id", "idempotency_key", name="uq_transaction_idempotency"),
        CheckConstraint("amount > 0", name="ck_transaction_amount_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference: Mapped[str] = mapped_column(String(32), unique=True)  # identifiant public : PAY_XXXXXXXXXXXXXXXX
    merchant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("merchants.id"), index=True)
    merchant_reference: Mapped[str] = mapped_column(String(64), index=True)  # ex. numéro de commande NovaShop
    idempotency_key: Mapped[str | None] = mapped_column(String(64))

    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[TransactionStatus] = mapped_column(Enum(TransactionStatus, name="transaction_status"))

    # Carte fictive : on ne conserve jamais le numéro complet ni le CVC
    card_brand: Mapped[str] = mapped_column(String(20))
    card_last4: Mapped[str] = mapped_column(String(4))
    decline_code: Mapped[str | None] = mapped_column(String(40))
    decline_message: Mapped[str | None] = mapped_column(String(200))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    merchant: Mapped[Merchant] = relationship(lazy="joined", innerjoin=True)
    events: Mapped[list["TransactionEvent"]] = relationship(
        back_populates="transaction", lazy="selectin", order_by="TransactionEvent.id"
    )

    def record(self, status: TransactionStatus, message: str) -> None:
        """Fait passer la transaction dans un nouvel état et l'inscrit au journal."""
        if status not in _TRANSITIONS[self.status]:
            raise ValueError(f"Transition interdite : {self.status} → {status}")
        now = _utcnow()
        self.status = status
        if status is TransactionStatus.CAPTURED:
            self.captured_at = now
        elif status is TransactionStatus.REFUNDED:
            self.refunded_at = now
        self.events.append(TransactionEvent(status=status, message=message, created_at=now))


class TransactionEvent(Base):
    """Journal des changements d'état, en ajout seul : base de la traçabilité des opérations."""

    __tablename__ = "transaction_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transactions.id"), index=True)
    status: Mapped[TransactionStatus] = mapped_column(Enum(TransactionStatus, name="transaction_status"))
    message: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    transaction: Mapped[Transaction] = relationship(back_populates="events")
