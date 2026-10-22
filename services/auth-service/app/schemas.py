import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    email: EmailStr = Field(examples=["alice@novashop.fr"])
    full_name: str = Field(min_length=2, max_length=100, examples=["Alice Martin"])
    # bcrypt ignore tout ce qui dépasse 72 octets : on borne la longueur
    password: str = Field(min_length=8, max_length=64, examples=["MotDePasse123"])

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.lower()

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Le nom doit contenir au moins 2 caractères")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("Le mot de passe doit contenir au moins une lettre et un chiffre")
        return v


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Durée de validité en secondes")


class HealthOut(BaseModel):
    status: str
    service: str


class DemoAccount(BaseModel):
    email: str
    full_name: str
    password: str


class DemoOut(BaseModel):
    enabled: bool = Field(description="Valeur de SEED_DEMO_USERS")
    accounts: list[DemoAccount]
