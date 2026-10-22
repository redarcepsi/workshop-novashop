"""Booster du jour : chaque joueur reçoit un booster offert par jour, choisi au hasard parmi les boosters d'un seul set
(l'édition premium, multi-sets, en est exclue).

Le booster offert est fixé pour la journée (heure de Paris) : il dépend de l'utilisateur et de la date, et non d'un
nouveau tirage à chaque visite, si bien que recharger la page ne permet pas d'en changer. Les cartes, elles, sont tirées
à l'ouverture, comme pour un booster payé (booster_service.draw). La clé primaire (utilisateur, jour) garantit un seul
booster par jour : une requête rejouée renvoie la même ouverture, sans en créer une seconde.
"""

import hashlib
import logging
import uuid
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import booster_service, collection_service, wallet_service
from .metrics import BOOSTERS_OPENED, DAILY_BOOSTERS
from .models import Booster, BoosterOpening, DailyBooster

logger = logging.getLogger("shop-service")

try:
    PARIS = ZoneInfo("Europe/Paris")
except ZoneInfoNotFoundError:  # image sans base des fuseaux horaires : la journée suit l'heure UTC
    PARIS = timezone.utc


def today() -> date:
    return datetime.now(PARIS).date()


def next_reset(day: date) -> datetime:
    """Minuit (heure de Paris) au soir de `day` : le prochain booster du jour devient disponible."""
    return datetime.combine(day + timedelta(days=1), time(), tzinfo=PARIS)


def _eligible(db: Session) -> list[Booster]:
    return [b for b in db.scalars(select(Booster).order_by(Booster.position)) if len(b.set_ids) == 1]


def pick(boosters: list[Booster], user_id: uuid.UUID, day: date) -> Booster:
    """Booster offert à cet utilisateur ce jour-là : pseudo-aléatoire, mais toujours le même pour la journée."""
    digest = hashlib.sha256(f"{user_id}:{day.isoformat()}".encode()).digest()
    return boosters[int.from_bytes(digest[:8], "big") % len(boosters)]


def _todays_booster(db: Session, user_id: uuid.UUID, day: date) -> Booster:
    boosters = _eligible(db)
    if not boosters:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aucun booster à offrir pour le moment")
    return pick(boosters, user_id, day)


def summary(db: Session, user_id: uuid.UUID) -> dict:
    day = today()
    claimed = db.get(DailyBooster, (user_id, day))
    booster = claimed.booster if claimed else _todays_booster(db, user_id, day)
    return {
        "day": day,
        "booster": booster_service.describe(db, [booster])[0],
        "claimed": claimed is not None,
        "claimed_at": claimed.claimed_at if claimed else None,
        "next_at": next_reset(day),
    }


def claim(db: Session, user_id: uuid.UUID) -> dict:
    """Ouvre le booster du jour : cartes tirées, ajoutées à la collection, rien n'est débité."""
    # Verrou du porte-monnaie : deux requêtes simultanées du même utilisateur passent l'une après l'autre
    wallet = wallet_service.lock(db, user_id)
    day = today()

    claimed = db.get(DailyBooster, (user_id, day))
    if claimed is not None:
        # Déjà ouvert aujourd'hui (double clic, nouvel essai après une coupure) : même ouverture
        result = booster_service.opening_out(db, claimed.opening, wallet.balance)
        db.rollback()
        return result

    booster = _todays_booster(db, user_id, day)
    card_ids = booster_service.draw(booster.slots, booster_service.card_pools(db, booster.set_ids))
    owned = collection_service.owned_ids(db, user_id, card_ids)
    opening = BoosterOpening(
        id=uuid.uuid4(),
        user_id=user_id,
        booster=booster,
        price=0,
        card_ids=card_ids,
        new_card_ids=list(dict.fromkeys(c for c in card_ids if c not in owned)),
    )
    db.add(opening)
    db.add(DailyBooster(user_id=user_id, day=day, booster=booster, opening=opening))
    collection_service.add(db, user_id, Counter(card_ids))
    db.commit()

    BOOSTERS_OPENED.labels(booster.slug).inc()
    DAILY_BOOSTERS.inc()
    logger.info("Booster du jour ouvert : user=%s booster=%s cartes=%s", user_id, booster.slug, ",".join(card_ids))
    return booster_service.opening_out(db, opening, wallet.balance)
