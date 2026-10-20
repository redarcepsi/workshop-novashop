import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
