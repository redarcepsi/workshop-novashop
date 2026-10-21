"""Métriques métier de la plateforme de paiement, exposées sur /metrics avec les métriques HTTP.

Elles suivent les lignes `transaction …` du journal : Grafana peut afficher le taux de refus et le montant encaissé
sans interroger la base.
"""

from prometheus_client import Counter

from .config import settings
from .models import Transaction

TRANSACTIONS = Counter(
    "payment_transactions_total",
    "Paiements et remboursements enregistrés, par statut final et motif de refus (- si aucun)",
    ["merchant", "status", "decline_code"],
)
AMOUNT = Counter(
    "payment_amount_total",
    "Montant des paiements et remboursements enregistrés, par statut final",
    ["merchant", "status", "currency"],
)

# Séries du marchand de démo créées à zéro : sans elles, le premier refus après un démarrage échapperait à
# increase() et rate(). Motifs de refus : voir processor.py
for _status, _code in [
    ("CAPTURED", "-"),
    ("REFUNDED", "-"),
    ("DECLINED", "card_declined"),
    ("DECLINED", "insufficient_funds"),
    ("DECLINED", "expired_card"),
]:
    TRANSACTIONS.labels(settings.merchant_code, _status, _code)
for _status in ("CAPTURED", "REFUNDED", "DECLINED"):
    AMOUNT.labels(settings.merchant_code, _status, "EUR")


def record(tx: Transaction) -> None:
    TRANSACTIONS.labels(tx.merchant.code, tx.status.value, tx.decline_code or "-").inc()
    AMOUNT.labels(tx.merchant.code, tx.status.value, tx.currency).inc(float(tx.amount))
