import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import API_PREFIX
from .database import init_db
from .routes import router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


# Pas de CORS : ce service n'est jamais appelé par un navigateur, uniquement par les marchands (serveur à serveur)
app = FastAPI(
    title="Payment Service",
    version="1.0.0",
    description=(
        "Plateforme de paiement fictive : elle encaisse les paiements par carte pour le compte de marchands "
        "(ex. la boutique **NovaShop**).\n\n"
        "- Authentification **marchand** par clé API (en-tête `X-API-Key`, bouton **Authorize**)\n"
        "- Paiements **idempotents** (en-tête `Idempotency-Key`)\n"
        "- Cycle de vie `PENDING → AUTHORIZED → CAPTURED → REFUNDED` (ou `DECLINED`), chaque étape est journalisée\n\n"
        "⚠️ Démonstration : aucun paiement réel, ni numéro de carte complet ni CVC conservé."
    ),
    docs_url=f"{API_PREFIX}/docs",
    redoc_url=f"{API_PREFIX}/redoc",
    openapi_url=f"{API_PREFIX}/openapi.json",
    openapi_tags=[
        {"name": "Transactions", "description": "Paiements par carte et remboursements"},
        {"name": "Système", "description": "Supervision"},
    ],
    lifespan=lifespan,
)

app.include_router(router)
