import enum
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
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


# ---------------------------------------------------------------- cartes (données de référence, issues de TCGdex)


class Rarity(str, enum.Enum):
    """Paliers de rareté, du plus courant au plus rare (Postgres trie un enum dans cet ordre)."""

    COMMON = "COMMON"            # Commune
    UNCOMMON = "UNCOMMON"        # Peu commune
    RARE = "RARE"                # Rare
    HOLO = "HOLO"                # Rare holo (anciens sets), double rare (cartes ex)
    ULTRA = "ULTRA"              # Ultra rare, illustration rare, HIGH-TECH rare
    SECRET = "SECRET"            # Illustration spéciale rare, hyper rare

    @property
    def rank(self) -> int:
        """0 pour une commune, 5 pour une secrète (un enum de chaînes se comparerait par ordre alphabétique)."""
        return list(Rarity).index(self)


class CardSet(Base):
    __tablename__ = "card_sets"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)  # identifiant TCGdex : base1, sv03.5…
    name: Mapped[str] = mapped_column(String(80))
    serie: Mapped[str] = mapped_column(String(80))
    release_date: Mapped[date | None] = mapped_column(Date)
    logo_url: Mapped[str | None] = mapped_column(String(300))
    position: Mapped[int] = mapped_column(Integer, default=0)


class Card(Base):
    __tablename__ = "cards"

    id: Mapped[str] = mapped_column(String(30), primary_key=True)  # identifiant TCGdex : base1-4, sv03.5-199…
    slug: Mapped[str] = mapped_column(String(80), unique=True)  # celui du produit qui vend la carte à l'unité
    set_id: Mapped[str] = mapped_column(ForeignKey("card_sets.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)  # numéro dans le set
    name: Mapped[str] = mapped_column(String(120), index=True)
    category: Mapped[str] = mapped_column(String(20))  # Pokémon, Dresseur, Énergie
    rarity: Mapped[Rarity] = mapped_column(Enum(Rarity, name="card_rarity"), index=True)
    rarity_label: Mapped[str] = mapped_column(String(40))  # libellé d'origine : « Illustration spéciale rare »…
    types: Mapped[list[str]] = mapped_column(JSONB, default=list)
    hp: Mapped[int | None] = mapped_column(Integer)
    illustrator: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    # Image hébergée par TCGdex, chargée directement par le navigateur : ajouter /low.webp ou /high.webp
    image_url: Mapped[str] = mapped_column(String(300))

    set: Mapped[CardSet] = relationship(lazy="joined", innerjoin=True)


# ---------------------------------------------------------------- catalogue (ce qui se paie en euros)


class ProductKind(str, enum.Enum):
    CARD = "CARD"                # une carte à l'unité, ajoutée à la collection au paiement
    POKEDOLLARS = "POKEDOLLARS"  # un lot de PokéDollars, crédité sur le porte-monnaie au paiement


# Un seul objet type : la colonne est partagée par products et order_items
PRODUCT_KIND = Enum(ProductKind, name="product_kind")


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("price > 0", name="ck_product_price_positive"),
        CheckConstraint("stock >= 0", name="ck_product_stock_non_negative"),
        CheckConstraint("(kind = 'CARD') = (card_id IS NOT NULL)", name="ck_product_card"),
        CheckConstraint("(kind = 'POKEDOLLARS') = (pokedollars IS NOT NULL)", name="ck_product_pokedollars"),
        CheckConstraint("pokedollars > 0", name="ck_product_pokedollars_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    kind: Mapped[ProductKind] = mapped_column(PRODUCT_KIND, index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    compare_at_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))  # prix barré (promo)
    stock: Mapped[int | None] = mapped_column(Integer)  # NULL : illimité (PokéDollars)
    card_id: Mapped[str | None] = mapped_column(ForeignKey("cards.id"), unique=True)
    pokedollars: Mapped[int | None] = mapped_column(Integer)  # montant crédité par unité
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    card: Mapped[Card | None] = relationship(lazy="joined")


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
    PAID = "PAID"            # payée : cartes et PokéDollars livrés aussitôt
    CANCELLED = "CANCELLED"  # annulée par le client : remboursée, cartes et PokéDollars repris


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    number: Mapped[str] = mapped_column(String(20), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    customer_email: Mapped[str] = mapped_column(String(255))
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus, name="order_status"), default=OrderStatus.PAID)

    total: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    pokedollars: Mapped[int] = mapped_column(Integer, default=0)  # PokéDollars crédités par la commande

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
    kind: Mapped[ProductKind] = mapped_column(PRODUCT_KIND)
    card_id: Mapped[str | None] = mapped_column(String(30))
    pokedollars: Mapped[int | None] = mapped_column(Integer)  # par unité
    image_url: Mapped[str | None] = mapped_column(String(300))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    quantity: Mapped[int] = mapped_column(Integer)
    line_total: Mapped[Decimal] = mapped_column(Numeric(10, 2))

    order: Mapped[Order] = relationship(back_populates="items")


# ---------------------------------------------------------------- porte-monnaie de PokéDollars


class Wallet(Base):
    __tablename__ = "wallets"
    __table_args__ = (CheckConstraint("balance >= 0", name="ck_wallet_balance_non_negative"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    balance: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class WalletReason(str, enum.Enum):
    PURCHASE = "PURCHASE"  # achat de PokéDollars (commande payée)
    BOOSTER = "BOOSTER"    # ouverture d'un booster
    REFUND = "REFUND"      # annulation d'une commande : les PokéDollars achetés sont repris


class WalletEntry(Base):
    """Journal des mouvements du porte-monnaie, en ajout seul : le solde se justifie ligne à ligne."""

    __tablename__ = "wallet_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    amount: Mapped[int] = mapped_column(Integer)  # positif : crédit, négatif : débit
    balance_after: Mapped[int] = mapped_column(Integer)
    reason: Mapped[WalletReason] = mapped_column(Enum(WalletReason, name="wallet_reason"))
    reference: Mapped[str] = mapped_column(String(40))  # numéro de commande ou identifiant d'ouverture
    label: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)


# ---------------------------------------------------------------- boosters et collection


class Booster(Base):
    __tablename__ = "boosters"
    __table_args__ = (CheckConstraint("price > 0", name="ck_booster_price_positive"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text)
    price: Mapped[int] = mapped_column(Integer)  # en PokéDollars
    set_ids: Mapped[list[str]] = mapped_column(JSONB)  # sets dont les cartes peuvent sortir
    # Une entrée par carte du booster : {rareté: poids}, ex. [{"COMMON": 1}, …, {"RARE": 2, "HOLO": 1}]
    slots: Mapped[list[dict[str, float]]] = mapped_column(JSONB)
    cover_card_id: Mapped[str] = mapped_column(ForeignKey("cards.id"))  # illustration du paquet
    colors: Mapped[list[str]] = mapped_column(JSONB)  # dégradé du paquet
    position: Mapped[int] = mapped_column(Integer, default=0)

    cover_card: Mapped[Card] = relationship(lazy="joined", innerjoin=True)


class BoosterOpening(Base):
    __tablename__ = "booster_openings"
    # La clé d'idempotence envoyée par le navigateur : un double clic n'ouvre (et ne débite) qu'un booster
    __table_args__ = (UniqueConstraint("user_id", "request_id", name="uq_opening_user_request"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    booster_id: Mapped[int] = mapped_column(ForeignKey("boosters.id"))
    price: Mapped[int] = mapped_column(Integer)
    request_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    card_ids: Mapped[list[str]] = mapped_column(JSONB)  # dans l'ordre de révélation
    new_card_ids: Mapped[list[str]] = mapped_column(JSONB)  # cartes absentes de la collection avant l'ouverture
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)

    booster: Mapped[Booster] = relationship(lazy="joined", innerjoin=True)


class CollectionItem(Base):
    """Les cartes possédées par un utilisateur, avec leur nombre d'exemplaires."""

    __tablename__ = "collection_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_collection_quantity_positive"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id"), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer)
    first_obtained_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_obtained_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    card: Mapped[Card] = relationship(lazy="joined", innerjoin=True)
