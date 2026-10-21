import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

bearer = HTTPBearer(auto_error=False, description="Clé partagée avec l'interface de chat (RAG_API_KEY)")


def require_api_key(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> None:
    if credentials is None or not secrets.compare_digest(
        credentials.credentials.encode(), settings.rag_api_key.encode()
    ):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Clé API invalide ou absente", headers={"WWW-Authenticate": "Bearer"}
        )
