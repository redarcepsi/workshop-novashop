"""Machine à sous : le joueur choisit une carte (n'importe laquelle du catalogue), mise des PokéDollars, et la gagne ou
repart les mains vides.

La mise et la chance de gain dépendent de la rareté de la carte (RULES). Le tirage a lieu sur le serveur, avec le
générateur aléatoire du système (secrets.SystemRandom), comme pour les boosters : le navigateur n'anime les rouleaux
qu'une fois le résultat connu. Débit de la mise, ajout éventuel de la carte à la collection et historique sont écrits
dans la même transaction ; la clé d'idempotence évite qu'un double clic ne joue (et ne débite) deux fois.
"""

import logging
import secrets
import uuid
from collections import Counter

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import collection_service, wallet_service
from .metrics import POKEDOLLARS, SLOT_SPINS
from .models import Card, Rarity, SlotSpin, WalletReason

logger = logging.getLogger("shop-service")

_rng = secrets.SystemRandom()

# Rareté de la carte visée → (mise en PokéDollars, chance de la gagner). Coût moyen d'une carte : mise / chance, soit
# 40 PokéDollars pour une commune et environ 19 000 pour une secrète (un booster coûte de 250 à 500 PokéDollars).
RULES: dict[Rarity, tuple[int, float]] = {
    Rarity.COMMON: (20, 0.50),
    Rarity.UNCOMMON: (40, 0.30),
    Rarity.RARE: (100, 0.15),
    Rarity.HOLO: (200, 0.10),
    Rarity.ULTRA: (400, 0.07),
    Rarity.SECRET: (750, 0.04),
}


def rules() -> list[dict]:
    return [{"rarity": rarity, "stake": stake, "chance": chance} for rarity, (stake, chance) in RULES.items()]


def _spin_out(spin: SlotSpin, balance: int) -> dict:
    return {
        "id": spin.id,
        "card": spin.card,
        "stake": spin.stake,
        "chance": spin.chance,
        "won": spin.won,
        "is_new": spin.is_new,
        "balance": balance,
        "spun_at": spin.spun_at,
    }


def spin(db: Session, user_id: uuid.UUID, card_id: str, request_id: uuid.UUID | None) -> dict:
    card = db.get(Card, card_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Carte introuvable")
    stake, chance = RULES[card.rarity]

    # Verrou du porte-monnaie : les parties d'un même utilisateur passent une par une
    wallet = wallet_service.lock(db, user_id)

    if request_id is not None:
        previous = db.scalar(select(SlotSpin).where(SlotSpin.user_id == user_id, SlotSpin.request_id == request_id))
        if previous is not None:
            # Requête rejouée (double clic, nouvel essai après une coupure) : même résultat, rien n'est redébité
            if previous.card_id != card_id:
                db.rollback()
                raise HTTPException(status.HTTP_409_CONFLICT, "Clé d'idempotence déjà utilisée pour une autre carte")
            result = _spin_out(previous, wallet.balance)
            db.rollback()
            return result

    if wallet.balance < stake:
        # Message calculé avant le rollback : un porte-monnaie créé par cette requête disparaît avec lui
        missing = wallet_service.format_pd(stake - wallet.balance)
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, f"Solde insuffisant : il vous manque {missing}")

    won = _rng.random() < chance
    record = SlotSpin(
        id=uuid.uuid4(),
        user_id=user_id,
        card=card,
        stake=stake,
        chance=chance,
        won=won,
        is_new=won and not collection_service.owned_ids(db, user_id, [card.id]),
        request_id=request_id,
    )
    db.add(record)
    wallet_service.debit(
        db, wallet, stake, WalletReason.SLOT, reference=str(record.id), label=f"Machine à sous : {card.name}"
    )
    if won:
        collection_service.add(db, user_id, Counter({card.id: 1}))
    db.commit()

    POKEDOLLARS.labels("spent").inc(stake)
    SLOT_SPINS.labels(card.rarity.value, "won" if won else "lost").inc()
    logger.info("Machine à sous : user=%s carte=%s mise=%s gagné=%s", user_id, card.id, stake, won)
    return _spin_out(record, wallet.balance)
