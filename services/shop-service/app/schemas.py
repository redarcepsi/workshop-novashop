import re
import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from .config import settings
from .models import OrderStatus, ProductKind, Rarity, WalletReason


# ---------------------------------------------------------------- cartes


class SetRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    serie: str = Field(examples=["Noir & Blanc"])
    logo_url: str | None


class SetOut(SetRef):
    release_date: date | None
    card_count: int = 0


class CardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(examples=["base1-4"])
    slug: str
    number: int
    name: str
    category: str
    rarity: Rarity
    rarity_label: str
    types: list[str]
    hp: int | None
    illustrator: str | None
    description: str | None
    image_url: str = Field(description="Image TCGdex : ajouter /low.webp (vignette) ou /high.webp")
    set: SetRef


# ---------------------------------------------------------------- catalogue


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    kind: ProductKind
    name: str
    description: str
    price: Decimal
    compare_at_price: Decimal | None
    stock: int | None = Field(description="Exemplaires disponibles ; null : illimité")
    card: CardOut | None = Field(description="La carte vendue (produits CARD)")
    pokedollars: int | None = Field(description="PokéDollars crédités par unité (produits POKEDOLLARS)")
    is_featured: bool

    @computed_field
    @property
    def in_stock(self) -> bool:
        return self.stock is None or self.stock > 0

    @computed_field
    @property
    def discount_percent(self) -> int | None:
        if self.compare_at_price and self.compare_at_price > self.price:
            return round((1 - self.price / self.compare_at_price) * 100)
        return None


class ProductPage(BaseModel):
    items: list[ProductOut]
    total: int
    limit: int
    offset: int


# ---------------------------------------------------------------- panier


# Borne de validation commune ; la limite propre à chaque article est vérifiée par cart_service.max_quantity()
MAX_QUANTITY = max(settings.max_quantity_per_item, settings.max_pokedollar_packs_per_item)


class CartItemIn(BaseModel):
    product_id: int = Field(examples=[1])
    quantity: int = Field(default=1, ge=1, le=MAX_QUANTITY)


class CartQuantityIn(BaseModel):
    quantity: int = Field(ge=1, le=MAX_QUANTITY, examples=[2])


class CartItemsIn(BaseModel):
    items: list[CartItemIn] = Field(max_length=50)


class CartItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product: ProductOut
    quantity: int
    line_total: Decimal
    available: bool = Field(description="Faux si le stock est devenu insuffisant pour cette quantité")


class CartOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[CartItemOut]
    items_count: int
    total: Decimal
    pokedollars: int = Field(description="PokéDollars crédités au paiement")
    cards_count: int = Field(description="Cartes ajoutées à la collection au paiement")


# ---------------------------------------------------------------- commande


def _luhn_valid(number: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(number)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


class CardPayment(BaseModel):
    card_number: str = Field(examples=["4242 4242 4242 4242"], description="Carte fictive (contrôle de Luhn)")
    expiry: str = Field(pattern=r"^(0[1-9]|1[0-2])/\d{2}$", examples=["12/30"], description="MM/AA")
    cvc: str = Field(pattern=r"^\d{3,4}$", examples=["123"])

    @field_validator("card_number")
    @classmethod
    def validate_card(cls, v: str) -> str:
        digits = re.sub(r"[\s-]", "", v)
        if not digits.isdigit() or not 13 <= len(digits) <= 19 or not _luhn_valid(digits):
            raise ValueError("Numéro de carte invalide")
        return digits

    @field_validator("expiry")
    @classmethod
    def validate_expiry(cls, v: str) -> str:
        month, year = int(v[:2]), 2000 + int(v[3:])
        today = date.today()
        if (year, month) < (today.year, today.month):
            raise ValueError("La carte est expirée")
        return v


class CheckoutRequest(BaseModel):
    # Produits numériques : pas d'adresse de livraison (un champ "shipping" envoyé par un ancien client est ignoré)
    payment: CardPayment


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: int | None
    product_slug: str
    product_name: str
    kind: ProductKind
    card_id: str | None
    pokedollars: int | None
    image_url: str | None
    unit_price: Decimal
    quantity: int
    line_total: Decimal


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    number: str
    status: OrderStatus
    items: list[OrderItemOut]
    total: Decimal
    pokedollars: int
    card_last4: str
    payment_reference: str
    created_at: datetime
    cancelled_at: datetime | None

    @computed_field
    @property
    def items_count(self) -> int:
        return sum(item.quantity for item in self.items)


# ---------------------------------------------------------------- porte-monnaie


class WalletEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    amount: int
    balance_after: int
    reason: WalletReason
    reference: str
    label: str
    created_at: datetime


class WalletOut(BaseModel):
    balance: int
    entries: list[WalletEntryOut] = Field(description="Les 30 derniers mouvements, du plus récent au plus ancien")


# ---------------------------------------------------------------- boosters


class BoosterOdds(BaseModel):
    rarity: Rarity
    chance: float = Field(description="Probabilité d'obtenir au moins une carte de cette rareté dans un booster")


class BoosterOut(BaseModel):
    slug: str
    name: str
    description: str
    price: int = Field(description="En PokéDollars")
    card_count: int
    sets: list[SetRef]
    cover: CardOut
    colors: list[str]
    odds: list[BoosterOdds]


class BoosterRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str


class OpenedCard(BaseModel):
    card: CardOut
    is_new: bool = Field(description="Absente de la collection avant cette ouverture")


class BoosterOpeningOut(BaseModel):
    id: uuid.UUID
    booster: BoosterRef
    price: int
    balance: int = Field(description="Solde de PokéDollars après l'ouverture")
    cards: list[OpenedCard]
    opened_at: datetime


class BoosterBatchOut(BaseModel):
    booster: BoosterRef
    count: int = Field(description="Boosters ouverts")
    price: int = Field(description="Total débité, en PokéDollars")
    balance: int = Field(description="Solde de PokéDollars après l'ouverture groupée")
    openings: list[BoosterOpeningOut] = Field(description="Une ouverture par booster, dans l'ordre")


# ---------------------------------------------------------------- collection


class CollectionSet(SetRef):
    owned: int
    total: int


class CollectionItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    card: CardOut
    quantity: int
    first_obtained_at: datetime


class CollectionBooster(BaseModel):
    """Un booster déjà ouvert par l'utilisateur, avec de quoi dessiner son paquet."""

    slug: str
    name: str
    card_count: int
    sets: list[SetRef]
    cover: CardOut
    colors: list[str]
    opened: int = Field(description="Boosters de ce type achetés et ouverts")
    spent: int = Field(description="PokéDollars dépensés pour ce booster")
    last_opened_at: datetime


class CollectionOut(BaseModel):
    distinct: int = Field(description="Cartes différentes possédées")
    copies: int = Field(description="Exemplaires possédés, doublons compris")
    total: int = Field(description="Cartes différentes au catalogue")
    value: Decimal = Field(description="Valeur de la collection au prix de la boutique")
    sets: list[CollectionSet]
    boosters: list[CollectionBooster] = Field(description="Boosters ouverts, du plus acheté au moins acheté")
    items: list[CollectionItemOut]


class HealthOut(BaseModel):
    status: str
    service: str
