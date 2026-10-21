"""Métriques métier de PokéBling, exposées sur /metrics avec les métriques HTTP.

Les deux premières suivent les incidents journalisés avec la plateforme de paiement : Grafana voit la panne ou la
lenteur de payment-service du point de vue de la boutique, dès la première tentative en échec. Les suivantes
décrivent l'économie de la monnaie virtuelle, qui ne passe pas par payment-service.
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
POKEDOLLARS = Counter(
    "shop_pokedollars_total",
    "PokéDollars : credited (achetés), spent (dépensés en boosters) ou revoked (repris à l'annulation d'une commande)",
    ["movement"],
)
BOOSTERS_OPENED = Counter("shop_boosters_opened_total", "Boosters ouverts", ["booster"])

# Séries créées à zéro : sans elles, le premier incident après un démarrage échapperait à increase() et rate()
for _reason in ("timeout", "unreachable", "server_error"):
    PAYMENT_SERVICE_ERRORS.labels(_reason)
for _outcome in ("refunded", "failed"):
    ORDER_COMPENSATIONS.labels(_outcome)
for _movement in ("credited", "spent", "revoked"):
    POKEDOLLARS.labels(_movement)
