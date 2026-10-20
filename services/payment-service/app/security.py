import hashlib

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Merchant

# Dans Swagger : bouton "Authorize" → coller la clé API du marchand
api_key_scheme = APIKeyHeader(name="X-API-Key", auto_error=False, description="Clé API du marchand")


def hash_api_key(api_key: str) -> str:
    # SHA-256 suffit ici (contrairement aux mots de passe) : une clé API est longue et aléatoire
    return hashlib.sha256(api_key.encode()).hexdigest()


def get_current_merchant(api_key: str | None = Security(api_key_scheme), db: Session = Depends(get_db)) -> Merchant:
    if api_key:
        merchant = db.scalar(select(Merchant).where(Merchant.api_key_hash == hash_api_key(api_key)))
        if merchant is not None and merchant.is_active:
            return merchant
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Clé API absente ou invalide")
