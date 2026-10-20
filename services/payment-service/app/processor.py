"""Réseau carte et banque émettrice simulés. Aucune donnée bancaire réelle n'est traitée ni stockée."""

from dataclasses import dataclass
from datetime import date

# Cartes de test qui simulent un refus de la banque émettrice : numéro → (code, message)
DECLINED_CARDS = {
    "4000000000000002": ("card_declined", "Paiement refusé par la banque émettrice"),
    "4000000000009995": ("insufficient_funds", "Paiement refusé : fonds insuffisants"),
}


@dataclass(frozen=True)
class Decision:
    approved: bool
    code: str | None = None
    message: str | None = None


def card_brand(number: str) -> str:
    if number.startswith("4"):
        return "visa"
    if number[:2] in {"34", "37"}:
        return "amex"
    if 51 <= int(number[:2]) <= 55 or 2221 <= int(number[:4]) <= 2720:
        return "mastercard"
    return "other"


def authorize(number: str, expiry: str) -> Decision:
    """Demande d'autorisation à la banque émettrice (fictive). `expiry` est au format MM/AA."""
    month, year = int(expiry[:2]), 2000 + int(expiry[3:])
    today = date.today()
    if (year, month) < (today.year, today.month):
        return Decision(False, "expired_card", "Paiement refusé : carte expirée")
    if number in DECLINED_CARDS:
        code, message = DECLINED_CARDS[number]
        return Decision(False, code, message)
    return Decision(True)
