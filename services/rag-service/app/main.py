import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from .assistant import assistant
from .config import API_PREFIX
from .indexer import indexer
from .routes import router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    indexer.start()
    threading.Thread(target=assistant.warm_up, name="warm-up", daemon=True).start()
    yield
    indexer.stop()


# Pas de CORS : ce service n'est appelé que par l'interface de chat, de serveur à serveur
app = FastAPI(
    title="RAG Service",
    version="1.0.0",
    description=(
        "Assistant documentaire des opérateurs (LangChain + Ollama) : il répond à partir des procédures, "
        "descriptions d'architecture et documents de gouvernance de l'équipe, en citant ses sources.\n\n"
        "- Documents lus dans `documents/` (Markdown, texte, YAML, PDF, Word), indexés dans **Chroma**\n"
        "- Embeddings **embeddinggemma**, génération **gemma4:e4b**\n"
        "- API compatible OpenAI (`/v1/models`, `/v1/chat/completions`), protégée par clé (`Authorization: Bearer`)\n\n"
        "⚠️ L'assistant n'a aucun accès au système : il explique, il n'agit pas."
    ),
    docs_url=f"{API_PREFIX}/docs",
    redoc_url=f"{API_PREFIX}/redoc",
    openapi_url=f"{API_PREFIX}/openapi.json",
    openapi_tags=[
        {"name": "Compatibilité OpenAI", "description": "Utilisée par l'interface de chat"},
        {"name": "Documents", "description": "État de l'index"},
        {"name": "Système", "description": "Supervision"},
    ],
    lifespan=lifespan,
)

app.include_router(router)

# Métriques Prometheus (requêtes par route, code HTTP et durée) sur /metrics. rag-service n'est pas publié :
# seule la passerelle metrics-gateway (profil "monitoring") relaie cette route, avec un jeton.
# Les sondes de santé, appelées toutes les 10 s, ne sont pas comptées. Métriques métier : voir metrics.py
instrumentator = Instrumentator(
    should_group_status_codes=False,
    excluded_handlers=["^/metrics$", f"^{API_PREFIX}/health$"],
)
instrumentator.instrument(app, latency_lowr_buckets=(0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10))
instrumentator.expose(app, include_in_schema=False)
