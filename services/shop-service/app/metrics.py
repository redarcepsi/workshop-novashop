"""Métriques métier de PokéBling, exposées sur /metrics avec les métriques HTTP.

Les deux premières suivent les incidents journalisés avec la plateforme de paiement : Grafana voit la panne ou la
lenteur de payment-service du point de vue de la boutique, dès la première tentative en échec. Les suivantes
décrivent l'économie de la monnaie virtuelle, qui ne passe pas par payment-service.
"""

from prometheus_client import Counter

from .models import Rarity

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
    "PokéDollars : credited (achetés), spent (dépensés en boosters ou misés à la machine à sous) ou revoked (repris à "
    "l'annulation d'une commande)",
    ["movement"],
)
BOOSTERS_OPENED = Counter("shop_boosters_opened_total", "Boosters ouverts, boosters du jour compris", ["booster"])
DAILY_BOOSTERS = Counter("shop_daily_boosters_total", "Boosters du jour ouverts (offerts)")
SLOT_SPINS = Counter(
    "shop_slot_spins_total",
    "Parties de machine à sous, par rareté de la carte visée et résultat : won (carte gagnée) ou lost",
    ["rarity", "outcome"],
)

# Séries créées à zéro : sans elles, le premier incident après un démarrage échapperait à increase() et rate()
for _reason in ("timeout", "unreachable", "server_error"):
    PAYMENT_SERVICE_ERRORS.labels(_reason)
for _outcome in ("refunded", "failed"):
    ORDER_COMPENSATIONS.labels(_outcome)
for _movement in ("credited", "spent", "revoked"):
    POKEDOLLARS.labels(_movement)
for _rarity in Rarity:
    for _outcome in ("won", "lost"):
        SLOT_SPINS.labels(_rarity.value, _outcome)
