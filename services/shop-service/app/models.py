import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- catalogue


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    emoji: Mapped[str] = mapped_column(String(16))
    position: Mapped[int] = mapped_column(Integer, default=0)


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("price > 0", name="ck_product_price_positive"),
        CheckConstraint("stock >= 0", name="ck_product_stock_non_negative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    compare_at_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))  # prix barré (promo)
    stock: Mapped[int] = mapped_column(Integer, default=0)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    details: Mapped[list[str]] = mapped_column(JSONB, default=list)  # caractéristiques (liste à puces)
    # Visuel : image_url si renseignée (SVG généré depuis `art`), sinon emoji sur fond coloré
    emoji: Mapped[str] = mapped_column(String(16))
    color: Mapped[str] = mapped_column(String(7))
    image_url: Mapped[str | None] = mapped_column(String(500))
    art: Mapped[dict | None] = mapped_column(JSONB)  # fiche d'apparence du personnage, lue par app/art.py
    rating: Mapped[float] = mapped_column(Float, default=0)
    reviews_count: Mapped[int] = mapped_column(Integer, default=0)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    category: Mapped[Category] = relationship(lazy="joined", innerjoin=True)


# ---------------------------------------------------------------- panier


class CartItem(Base):
    """Une ligne de panier. Le panier d'un utilisateur = toutes ses lignes."""

    __tablename__ = "cart_items"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_cart_user_product"),
        CheckConstraint("quantity > 0", name="ck_cart_quantity_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Identifiant de l'utilisateur dans auth-service (pas de clé étrangère : autre base, autre service)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    quantity: Mapped[int] = mapped_column(Integer)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    product: Mapped[Product] = relationship(lazy="joined", innerjoin=True)


# ---------------------------------------------------------------- commandes


class OrderStatus(str, enum.Enum):
    PAID = "PAID"            # payée, en préparation
    CANCELLED = "CANCELLED"  # annulée par le client, stock restitué


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    number: Mapped[str] = mapped_column(String(20), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    customer_email: Mapped[str] = mapped_column(String(255))
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus, name="order_status"), default=OrderStatus.PAID)

    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    shipping_cost: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2))

    shipping_name: Mapped[str] = mapped_column(String(100))
    shipping_address: Mapped[str] = mapped_column(String(200))
    shipping_postal_code: Mapped[str] = mapped_column(String(10))
    shipping_city: Mapped[str] = mapped_column(String(100))
    shipping_country: Mapped[str] = mapped_column(String(60))

    # Paiement fictif : on ne conserve jamais le numéro complet ni le CVC
    card_last4: Mapped[str] = mapped_column(String(4))
    payment_reference: Mapped[str] = mapped_column(String(32))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin", order_by="OrderItem.id"
    )


class OrderItem(Base):
    """Ligne de commande : nom et prix sont figés au moment de l'achat."""

    __tablename__ = "order_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_order_item_quantity_positive"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"))
    product_slug: Mapped[str] = mapped_column(String(80))
    product_name: Mapped[str] = mapped_column(String(120))
    emoji: Mapped[str] = mapped_column(String(16))
    color: Mapped[str] = mapped_column(String(7))
    image_url: Mapped[str | None] = mapped_column(String(500))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    quantity: Mapped[int] = mapped_column(Integer)
    line_total: Mapped[Decimal] = mapped_column(Numeric(10, 2))

    order: Mapped[Order] = relationship(back_populates="items")
