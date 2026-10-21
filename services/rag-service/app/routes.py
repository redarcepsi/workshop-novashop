import json
import logging
import secrets
import time
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from .assistant import ANSWER, REASONING, Prepared, assistant
from .config import API_PREFIX, MODEL_ID, settings
from .indexer import indexer
from .metrics import FAILURES
from .schemas import ChatCompletionRequest
from .security import require_api_key

logger = logging.getLogger("rag-service")
STARTED_AT = int(time.time())

router = APIRouter(prefix=API_PREFIX)
protected = [Depends(require_api_key)]


@router.get("/health", tags=["Système"])
def health() -> dict:
    return {"status": "ok", "model": settings.llm_model, "embedding_model": settings.embedding_model}


@router.get("/documents", tags=["Documents"], dependencies=protected)
def documents() -> dict:
    """Documents indexés, nombre d'extraits par document et fichiers qui n'ont pas pu être lus."""
    return indexer.stats()


@router.post("/reindex", tags=["Documents"], dependencies=protected)
def reindex() -> dict:
    """Synchronise l'index tout de suite, sans attendre le prochain cycle."""
    return indexer.sync()


# --- API compatible OpenAI, appelée par l'interface de chat (assistant-ui) -------------------------

@router.get("/v1/models", tags=["Compatibilité OpenAI"], dependencies=protected)
def list_models() -> dict:
    return {
        "object": "list",
        "data": [{"id": MODEL_ID, "object": "model", "created": STARTED_AT, "owned_by": "resilience-alpha"}],
    }


@router.post("/v1/chat/completions", tags=["Compatibilité OpenAI"], dependencies=protected)
async def chat_completions(payload: ChatCompletionRequest):
    try:
        # Les fichiers joints restent dans la conversation : ceux des messages précédents comptent aussi
        files = [file for m in payload.messages if m.role == "user" for file in m.files()]
        prepared = await assistant.prepare([(m.role, m.text()) for m in payload.messages], files)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except Exception as exc:
        FAILURES.labels("search").inc()
        logger.exception("Recherche documentaire impossible")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Recherche documentaire indisponible (Ollama injoignable ?)"
        ) from exc

    completion_id = "chatcmpl-" + secrets.token_hex(12)
    created = int(time.time())
    if payload.stream:
        return StreamingResponse(_stream(prepared, completion_id, created), media_type="text/event-stream")

    try:
        parts = [part async for part in assistant.generate(prepared)]
    except Exception as exc:
        FAILURES.labels("generation").inc()
        logger.exception("Génération impossible")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Modèle local indisponible") from exc
    message = {"role": "assistant", "content": "".join(text for kind, text in parts if kind == ANSWER)}
    if reasoning := "".join(text for kind, text in parts if kind == REASONING):
        message["reasoning_content"] = reasoning
    return {
        "id": completion_id,
        "object": "chat.completion",
        "created": created,
        "model": MODEL_ID,
        "choices": [{"index": 0, "message": message, "finish_reason": "stop"}],
    }


def _event(completion_id: str, created: int, delta: dict, finish_reason: str | None = None) -> str:
    chunk = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": MODEL_ID,
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish_reason}],
    }
    return f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"


async def _stream(prepared: Prepared, completion_id: str, created: int) -> AsyncIterator[str]:
    yield _event(completion_id, created, {"role": "assistant", "content": ""})
    try:
        async for kind, text in assistant.generate(prepared):
            # reasoning_content : extension courante de l'API (DeepSeek, vLLM…), affichée à part par l'interface
            yield _event(completion_id, created, {"reasoning_content" if kind == REASONING else "content": text})
    except Exception:
        # La réponse a déjà commencé : on ne peut plus renvoyer un code d'erreur, on prévient dans le texte
        FAILURES.labels("generation").inc()
        logger.exception("Génération interrompue")
        yield _event(completion_id, created, {"content": "\n\n⚠️ Le modèle local ne répond plus, réessayez."})
    yield _event(completion_id, created, {}, "stop")
    yield "data: [DONE]\n\n"
