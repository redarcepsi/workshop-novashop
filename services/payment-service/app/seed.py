"""Marchand de démonstration (NovaShop), créé au démarrage s'il n'existe pas (désactivable : SEED_MERCHANT=false)."""

import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .models import Merchant
from .security import hash_api_key

logger = logging.getLogger("payment-service")


def seed_merchant(db: Session) -> None:
    key_hash = hash_api_key(settings.merchant_api_key)
    merchant = db.scalar(select(Merchant).where(Merchant.code == settings.merchant_code))
    if merchant is None:
        db.add(Merchant(code=settings.merchant_code, name=settings.merchant_name, api_key_hash=key_hash))
        action = "créé"
    elif merchant.api_key_hash != key_hash:
        merchant.api_key_hash = key_hash
        action = "clé API renouvelée"
    else:
        return
    try:
        db.commit()
    except IntegrityError:
        # Une autre instance du service l'a créé en même temps
        db.rollback()
        return
    logger.info("Marchand de démo %s : %s", settings.merchant_code, action)
