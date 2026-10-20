import uuid
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

# Dans Swagger : bouton "Authorize" → coller le access_token obtenu via auth-service /login
bearer_scheme = HTTPBearer(auto_error=False, description="JWT délivré par auth-service")


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    email: str
    name: str


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> CurrentUser:
    """Vérifie le JWT localement (signature + expiration), sans appeler auth-service."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Jeton invalide ou expiré",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "exp", "email", "name"]},
        )
        return CurrentUser(id=uuid.UUID(payload["sub"]), email=payload["email"], name=payload["name"])
    except (jwt.PyJWTError, ValueError):
        raise unauthorized
