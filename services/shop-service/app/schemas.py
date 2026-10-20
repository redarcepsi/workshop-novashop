import re
import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from .config import settings
from .models import OrderStatus


# ---------------------------------------------------------------- catalogue


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str
    emoji: str
    product_count: int = 0


class CategoryRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    description: str
    details: list[str]
    price: Decimal
    compare_at_price: Decimal | None
    stock: int
    category: CategoryRef
    emoji: str
    color: str
    image_url: str | None
    rating: float
    reviews_count: int
    is_featured: bool

    @computed_field
    @property
    def in_stock(self) -> bool:
        return self.stock > 0

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


class CartItemIn(BaseModel):
    product_id: int = Field(examples=[1])
    quantity: int = Field(default=1, ge=1, le=settings.max_quantity_per_item)


class CartQuantityIn(BaseModel):
    quantity: int = Field(ge=1, le=settings.max_quantity_per_item, examples=[2])


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
    subtotal: Decimal
    shipping_cost: Decimal
    total: Decimal
    free_shipping_threshold: Decimal
    free_shipping_remaining: Decimal


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


class ShippingAddress(BaseModel):
    full_name: str = Field(min_length=2, max_length=100, examples=["Alice Martin"])
    address: str = Field(min_length=5, max_length=200, examples=["12 rue des Lilas"])
    postal_code: str = Field(pattern=r"^[A-Za-z0-9 -]{3,10}$", examples=["75011"])
    city: str = Field(min_length=1, max_length=100, examples=["Paris"])
    country: str = Field(default="France", min_length=2, max_length=60)


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
    shipping: ShippingAddress
    payment: CardPayment


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: int | None
    product_slug: str
    product_name: str
    emoji: str
    color: str
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
    subtotal: Decimal
    shipping_cost: Decimal
    total: Decimal
    shipping_name: str
    shipping_address: str
    shipping_postal_code: str
    shipping_city: str
    shipping_country: str
    card_last4: str
    payment_reference: str
    created_at: datetime
    cancelled_at: datetime | None

    @computed_field
    @property
    def items_count(self) -> int:
        return sum(item.quantity for item in self.items)


class HealthOut(BaseModel):
    status: str
    service: str
