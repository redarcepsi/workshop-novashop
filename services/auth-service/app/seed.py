"""Comptes de démonstration, créés au démarrage s'ils n'existent pas (désactivable : SEED_DEMO_USERS=false)."""

import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import User
from .security import hash_password

logger = logging.getLogger("auth-service")

DEMO_USERS = [
    {"email": "leo@novashop.fr", "full_name": "Léo Martin", "password": "Demo1234"},
    {"email": "ines@novashop.fr", "full_name": "Inès Durand", "password": "Demo1234"},
]


def seed_demo_users(db: Session) -> None:
    existing = set(db.scalars(select(User.email).where(User.email.in_([u["email"] for u in DEMO_USERS]))))
    created = [u for u in DEMO_USERS if u["email"] not in existing]
    for u in created:
        db.add(User(email=u["email"], full_name=u["full_name"], hashed_password=hash_password(u["password"])))
    try:
        db.commit()
    except IntegrityError:
        # Une autre instance du service les a créés en même temps
        db.rollback()
        return
    if created:
        logger.info("Comptes de démo créés : %s", ", ".join(u["email"] for u in created))
