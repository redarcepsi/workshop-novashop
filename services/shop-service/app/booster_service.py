"""Boosters : probabilités affichées, tirage des cartes et ouverture (débit des PokéDollars + ajout à la collection).

Le tirage a lieu sur le serveur, avec le générateur aléatoire du système (secrets.SystemRandom) : le navigateur ne
choisit rien et ne peut pas prévoir les cartes. Débit, ajout à la collection et historique sont écrits dans la même
transaction : un booster est ouvert entièrement ou pas du tout. Une ouverture groupée (jusqu'à 5 boosters) suit la
même règle : tous les boosters sont payés et ouverts, ou aucun.
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

MAX_BATCH = 5  # boosters ouverts d'un coup, au plus


def card_pools(db: Session, set_ids: list[str]) -> dict[Rarity, list[str]]:
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
                "odds": odds(booster, card_pools(db, booster.set_ids)),
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


def _request_ids(request_id: uuid.UUID | None, count: int) -> list[uuid.UUID | None]:
    """Clé d'idempotence de chaque booster. Ouverture groupée : une clé dérivée par booster, toujours la même pour
    une clé donnée (UUID v5), car la base n'accepte qu'une ouverture par clé et par utilisateur."""
    if request_id is None:
        return [None] * count
    if count == 1:
        return [request_id]
    return [uuid.uuid5(request_id, f"{i + 1}/{count}") for i in range(count)]


def open_boosters(db: Session, user_id: uuid.UUID, slug: str, request_id: uuid.UUID | None, count: int = 1) -> dict:
    """Ouvre `count` boosters identiques dans une seule transaction : tous sont payés et ouverts, ou aucun."""
    booster = db.scalar(select(Booster).where(Booster.slug == slug))
    if booster is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booster introuvable")

    # Verrou du porte-monnaie : les ouvertures d'un même utilisateur passent une par une
    wallet = wallet_service.lock(db, user_id)
    request_ids = _request_ids(request_id, count)

    if request_id is not None:
        previous = {
            o.request_id: o
            for o in db.scalars(
                select(BoosterOpening).where(BoosterOpening.user_id == user_id, BoosterOpening.request_id.in_(request_ids))
            )
        }
        if previous:
            # Requête rejouée (double clic, nouvel essai après une coupure) : même résultat, rien n'est redébité
            if len(previous) != count or any(o.booster_id != booster.id for o in previous.values()):
                db.rollback()
                raise HTTPException(status.HTTP_409_CONFLICT, "Clé d'idempotence déjà utilisée pour un autre booster")
            result = _batch_out(db, booster, [previous[r] for r in request_ids], wallet.balance)
            db.rollback()
            return result

    total = booster.price * count
    if wallet.balance < total:
        # Message calculé avant le rollback : un porte-monnaie créé par cette requête disparaît avec lui
        missing = wallet_service.format_pd(total - wallet.balance)
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, f"Solde insuffisant : il vous manque {missing}")

    pools = card_pools(db, booster.set_ids)
    draws = [draw(booster.slots, pools) for _ in range(count)]
    owned = collection_service.owned_ids(db, user_id, [c for card_ids in draws for c in card_ids])
    openings = []
    for card_ids, rid in zip(draws, request_ids):
        # « Nouvelle » une seule fois : une carte tirée dans un booster précédent du lot n'est plus nouvelle
        new_card_ids = list(dict.fromkeys(c for c in card_ids if c not in owned))
        owned.update(new_card_ids)
        opening = BoosterOpening(
            id=uuid.uuid4(),
            user_id=user_id,
            booster=booster,
            price=booster.price,
            request_id=rid,
            card_ids=card_ids,
            new_card_ids=new_card_ids,
        )
        db.add(opening)
        wallet_service.debit(
            db, wallet, booster.price, WalletReason.BOOSTER, reference=str(opening.id), label=f"Ouverture : {booster.name}"
        )
        openings.append(opening)
    collection_service.add(db, user_id, Counter(c for card_ids in draws for c in card_ids))
    db.commit()

    BOOSTERS_OPENED.labels(booster.slug).inc(count)
    POKEDOLLARS.labels("spent").inc(total)
    for card_ids in draws:
        logger.info("Booster ouvert : user=%s booster=%s cartes=%s", user_id, booster.slug, ",".join(card_ids))
    return _batch_out(db, booster, openings, wallet.balance)


def _batch_out(db: Session, booster: Booster, openings: list[BoosterOpening], balance: int) -> dict:
    return {
        "booster": booster,
        "count": len(openings),
        "price": sum(o.price for o in openings),
        "balance": balance,
        "openings": [opening_out(db, o, balance) for o in openings],
    }


def open_booster(db: Session, user_id: uuid.UUID, slug: str, request_id: uuid.UUID | None) -> dict:
    return open_boosters(db, user_id, slug, request_id, 1)["openings"][0]
