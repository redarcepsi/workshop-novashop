import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import API_PREFIX, settings
from .database import init_db
from .routers import cart, catalog, media, orders
from .schemas import HealthOut

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="NovaShop — Shop Service",
    version="1.0.0",
    description=(
        "API métier de la boutique en ligne fictive **NovaShop**, spécialisée en body pillows de personnages "
        "de jeu vidéo originaux : catalogue, panier, commandes, paiement par carte simulé et visuels SVG.\n\n"
        "- **Catalogue** : public, sans authentification\n"
        "- **Panier** et **Commandes** : exigent un **JWT** délivré par `auth-service` "
        "(`POST /api/auth/login`). Cliquer sur **Authorize** et coller le `access_token`.\n\n"
        "⚠️ Boutique de démonstration : aucun paiement réel, aucune donnée bancaire conservée."
    ),
    docs_url=f"{API_PREFIX}/docs",
    redoc_url=f"{API_PREFIX}/redoc",
    openapi_url=f"{API_PREFIX}/openapi.json",
    openapi_tags=[
        {"name": "Catalogue", "description": "Catégories et produits (public)"},
        {"name": "Panier", "description": "Panier de l'utilisateur connecté, et chiffrage d'un panier invité"},
        {"name": "Commandes", "description": "Paiement du panier, historique et annulation"},
        {"name": "Médias", "description": "Visuels des produits, générés en SVG"},
        {"name": "Système", "description": "Supervision"},
    ],
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(f"{API_PREFIX}/health", response_model=HealthOut, tags=["Système"], summary="Sonde de santé")
def health():
    return {"status": "ok", "service": "shop-service"}


app.include_router(catalog.router)
app.include_router(cart.router)
app.include_router(orders.router)
app.include_router(media.router)
