"""Métriques métier de NovaShop, exposées sur /metrics avec les métriques HTTP.

Elles suivent les incidents journalisés avec la plateforme de paiement : Grafana voit la panne ou la lenteur de
payment-service du point de vue de la boutique, dès la première tentative en échec.
"""

from prometheus_client import Counter

PAYMENT_SERVICE_ERRORS = Counter(
    "shop_payment_service_errors_total",
    "Appels à payment-service en échec, nouvelles tentatives comprises : timeout, unreachable ou server_error",
    ["reason"],
)
ORDER_COMPENSATIONS = Counter(
    "shop_order_compensations_total",
    "Commandes non enregistrées après un paiement accepté : refunded (client remboursé) ou failed (à régulariser)",
    ["outcome"],
)

# Séries créées à zéro : sans elles, le premier incident après un démarrage échapperait à increase() et rate()
for _reason in ("timeout", "unreachable", "server_error"):
    PAYMENT_SERVICE_ERRORS.labels(_reason)
for _outcome in ("refunded", "failed"):
    ORDER_COMPENSATIONS.labels(_outcome)
