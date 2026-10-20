import re
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import TransactionStatus


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


class CardIn(BaseModel):
    number: str = Field(examples=["4242 4242 4242 4242"], description="Carte fictive (contrôle de Luhn)")
    expiry: str = Field(pattern=r"^(0[1-9]|1[0-2])/\d{2}$", examples=["12/30"], description="MM/AA")
    cvc: str = Field(pattern=r"^\d{3,4}$", examples=["123"])

    @field_validator("number")
    @classmethod
    def validate_number(cls, v: str) -> str:
        digits = re.sub(r"[\s-]", "", v)
        if not digits.isdigit() or not 13 <= len(digits) <= 19 or not _luhn_valid(digits):
            raise ValueError("Numéro de carte invalide")
        return digits


class PaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2, examples=["54.90"])
    currency: Literal["EUR"] = "EUR"
    merchant_reference: str = Field(
        min_length=1, max_length=64, examples=["CMD-261020-A1B2C3"], description="Référence côté marchand"
    )
    card: CardIn


class TransactionEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: TransactionStatus
    message: str
    created_at: datetime


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    reference: str
    status: TransactionStatus
    amount: Decimal
    currency: str
    merchant_reference: str
    card_brand: str
    card_last4: str
    decline_code: str | None
    decline_message: str | None
    created_at: datetime
    captured_at: datetime | None
    refunded_at: datetime | None
    events: list[TransactionEventOut]


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int
    limit: int
    offset: int


class HealthOut(BaseModel):
    status: str
    service: str
