"""Boosters : probabilités affichées, tirage des cartes et ouverture (débit des PokéDollars + ajout à la collection).

Le tirage a lieu sur le serveur, avec le générateur aléatoire du système (secrets.SystemRandom) : le navigateur ne
choisit rien et ne peut pas prévoir les cartes. Débit, ajout à la collection et historique sont écrits dans la même
transaction : un booster est ouvert entièrement ou pas du tout.
"""

import logging
import secrets
import uuid
from collections import Counter

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import collection_service, wallet_service
from .metrics import BOOSTERS_OPENED, POKEDOLLARS
from .models import Booster, BoosterOpening, Card, CardSet, Rarity, WalletReason

logger = logging.getLogger("shop-service")

_rng = secrets.SystemRandom()


def _pools(db: Session, set_ids: list[str]) -> dict[Rarity, list[str]]:
    pools: dict[Rarity, list[str]] = {}
    for card_id, rarity in db.execute(select(Card.id, Card.rarity).where(Card.set_id.in_(set_ids)).order_by(Card.id)):
        pools.setdefault(rarity, []).append(card_id)
    return pools


def _slot_weights(slot: dict[str, float], pools: dict[Rarity, list[str]]) -> dict[Rarity, float]:
    """Poids d'un emplacement, limités aux raretés présentes dans les sets du booster (les anciens sets n'ont pas
    d'ultra rare, par exemple). Repli sur toutes les raretés disponibles si aucune ne correspond."""
    weights = {Rarity(r): w for r, w in slot.items() if pools.get(Rarity(r))}
    return weights or {r: 1.0 for r in pools}


def odds(booster: Booster, pools: dict[Rarity, list[str]]) -> list[dict]:
    """Probabilité d'obtenir au moins une carte de chaque rareté, sur l'ensemble des emplacements."""
    result = []
    for rarity in Rarity:
        if not pools.get(rarity):
            continue
        miss = 1.0
        for slot in booster.slots:
            weights = _slot_weights(slot, pools)
            miss *= 1 - weights.get(rarity, 0) / sum(weights.values())
        if miss < 1:
            result.append({"rarity": rarity, "chance": round(1 - miss, 4)})
    return result


def describe(db: Session, boosters: list[Booster]) -> list[dict]:
    sets = {s.id: s for s in db.scalars(select(CardSet))}
    out = []
    for booster in boosters:
        out.append(
            {
                "slug": booster.slug,
                "name": booster.name,
                "description": booster.description,
                "price": booster.price,
                "card_count": len(booster.slots),
                "sets": [sets[s] for s in booster.set_ids],
                "cover": booster.cover_card,
                "colors": booster.colors,
                "odds": odds(booster, _pools(db, booster.set_ids)),
            }
        )
    return out


def draw(slots: list[dict[str, float]], pools: dict[Rarity, list[str]]) -> list[str]:
    drawn: list[str] = []
    for slot in slots:
        weights = _slot_weights(slot, pools)
        rarity = _rng.choices(list(weights), weights=list(weights.values()))[0]
        # Pas deux fois la même carte dans un booster, tant que le set le permet
        candidates = [c for c in pools[rarity] if c not in drawn] or pools[rarity]
        drawn.append(_rng.choice(candidates))
    return drawn


def opening_out(db: Session, opening: BoosterOpening, balance: int) -> dict:
    cards = {c.id: c for c in db.scalars(select(Card).where(Card.id.in_(opening.card_ids)))}
    new = set(opening.new_card_ids)
    return {
        "id": opening.id,
        "booster": opening.booster,
        "price": opening.price,
        "balance": balance,
        "cards": [{"card": cards[card_id], "is_new": card_id in new} for card_id in opening.card_ids],
        "opened_at": opening.opened_at,
    }


def open_booster(db: Session, user_id: uuid.UUID, slug: str, request_id: uuid.UUID | None) -> dict:
    booster = db.scalar(select(Booster).where(Booster.slug == slug))
    if booster is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booster introuvable")

    # Verrou du porte-monnaie : les ouvertures d'un même utilisateur passent une par une
    wallet = wallet_service.lock(db, user_id)

    if request_id is not None:
        previous = db.scalar(
            select(BoosterOpening).where(BoosterOpening.user_id == user_id, BoosterOpening.request_id == request_id)
        )
        if previous is not None:
            # Requête rejouée (double clic, nouvel essai après une coupure) : même résultat, rien n'est redébité
            if previous.booster_id != booster.id:
                db.rollback()
                raise HTTPException(status.HTTP_409_CONFLICT, "Clé d'idempotence déjà utilisée pour un autre booster")
            result = opening_out(db, previous, wallet.balance)
            db.rollback()
            return result

    if wallet.balance < booster.price:
        # Message calculé avant le rollback : un porte-monnaie créé par cette requête disparaît avec lui
        missing = wallet_service.format_pd(booster.price - wallet.balance)
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, f"Solde insuffisant : il vous manque {missing}")

    card_ids = draw(booster.slots, _pools(db, booster.set_ids))
    already_owned = collection_service.owned_ids(db, user_id, card_ids)
    opening = BoosterOpening(
        id=uuid.uuid4(),
        user_id=user_id,
        booster=booster,
        price=booster.price,
        request_id=request_id,
        card_ids=card_ids,
        new_card_ids=list(dict.fromkeys(c for c in card_ids if c not in already_owned)),
    )
    db.add(opening)
    wallet_service.debit(
        db, wallet, booster.price, WalletReason.BOOSTER, reference=str(opening.id), label=f"Ouverture : {booster.name}"
    )
    collection_service.add(db, user_id, Counter(card_ids))
    db.commit()

    BOOSTERS_OPENED.labels(booster.slug).inc()
    POKEDOLLARS.labels("spent").inc(booster.price)
    logger.info("Booster ouvert : user=%s booster=%s cartes=%s", user_id, booster.slug, ",".join(card_ids))
    return opening_out(db, opening, wallet.balance)
