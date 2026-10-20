"""Client de la plateforme de paiement (payment-service).

NovaShop y est un marchand parmi d'autres : il s'authentifie avec sa clé API et ne conserve jamais le numéro de
carte. Chaque paiement porte une clé d'idempotence (le numéro de commande) : rejouer la requête après un délai
dépassé ne débite pas le client une seconde fois.
"""

import logging
import time
from dataclasses import dataclass
from decimal import Decimal

import httpx
from fastapi import HTTPException, status

from .config import settings
from .schemas import CardPayment

logger = logging.getLogger("shop-service")

_client = httpx.Client(
    base_url=f"{settings.payment_service_url.rstrip('/')}/api/payment",
    headers={"X-API-Key": settings.payment_api_key},
    timeout=httpx.Timeout(settings.payment_timeout, connect=1.0),
)


@dataclass(frozen=True)
class Payment:
    reference: str
    card_last4: str


def _send(method: str, path: str, **kwargs) -> httpx.Response:
    """Envoie la requête, et la retente si le service ne répond pas ou répond en erreur 5xx."""
    for attempt in range(1, settings.payment_attempts + 1):
        try:
            response = _client.request(method, path, **kwargs)
        except httpx.TransportError as exc:
            logger.warning("payment-service injoignable (tentative %s/%s) : %r", attempt, settings.payment_attempts, exc)
        else:
            if response.status_code < 500:
                return response
            logger.warning(
                "payment-service en erreur %s (tentative %s/%s)", response.status_code, attempt, settings.payment_attempts
            )
        if attempt < settings.payment_attempts:
            time.sleep(0.3)
    raise HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "Le service de paiement est momentanément indisponible, veuillez réessayer dans quelques instants",
    )


def charge(card: CardPayment, amount: Decimal, order_number: str) -> Payment:
    """Débite la carte. Lève 402 si la banque refuse, 503 si la plateforme de paiement ne répond pas."""
    response = _send(
        "POST",
        "/transactions",
        json={
            "amount": str(amount),
            "currency": "EUR",
            "merchant_reference": order_number,
            "card": {"number": card.card_number, "expiry": card.expiry, "cvc": card.cvc},
        },
        headers={"Idempotency-Key": order_number},
    )
    if response.status_code == status.HTTP_402_PAYMENT_REQUIRED:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, response.json().get("detail") or "Paiement refusé")
    if response.status_code not in (status.HTTP_200_OK, status.HTTP_201_CREATED) or response.json()["status"] != "CAPTURED":
        logger.error("Paiement de la commande %s rejeté : %s %s", order_number, response.status_code, response.text[:300])
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Le paiement n'a pas pu être traité")
    data = response.json()
    return Payment(reference=data["reference"], card_last4=data["card_last4"])


def refund(reference: str) -> None:
    """Rembourse intégralement. Idempotent côté plateforme : peut être rappelé sans risque."""
    response = _send("POST", f"/transactions/{reference}/refund")
    if response.status_code != status.HTTP_200_OK:
        logger.error("Remboursement de %s rejeté : %s %s", reference, response.status_code, response.text[:300])
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Le remboursement n'a pas pu être effectué")
