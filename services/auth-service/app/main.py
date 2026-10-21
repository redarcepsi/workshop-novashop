import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from .config import API_PREFIX, settings
from .database import init_db
from .routes import router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="NovaShop — Auth Service",
    version="1.0.0",
    description=(
        "Service d'authentification de la boutique fictive **NovaShop**.\n\n"
        "- Mots de passe hachés avec **bcrypt**\n"
        "- Jetons **JWT** (HS256) signés avec un secret partagé avec `shop-service`\n\n"
        "Pour tester : `POST /register`, puis bouton **Authorize** (email dans *username*)."
    ),
    docs_url=f"{API_PREFIX}/docs",
    redoc_url=f"{API_PREFIX}/redoc",
    openapi_url=f"{API_PREFIX}/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

# Métriques Prometheus (requêtes par route, code HTTP et durée) sur /metrics : hors du préfixe /api/auth, nginx ne
# la relaie pas. Seule la passerelle metrics-gateway (profil "monitoring") la publie, avec un jeton.
# Les sondes de santé, appelées toutes les 10 s, ne sont pas comptées.
instrumentator = Instrumentator(
    should_group_status_codes=False,
    excluded_handlers=["^/metrics$", f"^{API_PREFIX}/health$"],
)
instrumentator.instrument(app, latency_lowr_buckets=(0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10))
instrumentator.expose(app, include_in_schema=False)
