"""Prestataire de paiement simulé. Aucune donnée bancaire réelle n'est traitée ni stockée."""

import secrets
from decimal import Decimal

from fastapi import HTTPException, status

# Cartes de test qui simulent un refus
DECLINED_CARDS = {
    "4000000000000002": "Paiement refusé par la banque émettrice",
    "4000000000009995": "Paiement refusé : fonds insuffisants",
}


def charge(card_number: str, amount: Decimal) -> str:
    """Débite la carte (fictivement) et retourne une référence de paiement."""
    if card_number in DECLINED_CARDS:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, DECLINED_CARDS[card_number])
    return "PAY_" + secrets.token_hex(8).upper()
