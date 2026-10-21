"""Métriques métier de l'assistant, exposées sur /metrics avec les métriques HTTP.

Une réponse en flux reste en 200 même si le modèle s'arrête en cours de route : seules ces métriques le montrent.
"""

from prometheus_client import Counter, Histogram

ANSWER_DURATION = Histogram(
    "rag_answer_duration_seconds",
    "Durée de génération des réponses (réflexion comprise), du premier appel au modèle à la fin de la réponse",
    buckets=(5, 10, 20, 30, 45, 60, 90, 120, 180, 300),
)
FAILURES = Counter(
    "rag_failures_total",
    "Questions restées sans réponse complète : search (recherche documentaire) ou generation (modèle local)",
    ["stage"],
)

# Séries créées à zéro : sans elles, la première panne après un démarrage échapperait à increase() et rate()
for _stage in ("search", "generation"):
    FAILURES.labels(_stage)
