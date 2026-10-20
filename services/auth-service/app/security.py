import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .config import API_PREFIX, settings
from .database import get_db
from .models import User

# tokenUrl permet au bouton "Authorize" de Swagger de se connecter directement
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{API_PREFIX}/login")

# Hash factice utilisé quand l'email n'existe pas, pour que le temps de réponse
# ne révèle pas si un compte existe (timing attack).
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password", bcrypt.gensalt(rounds=settings.bcrypt_rounds))


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=settings.bcrypt_rounds)).decode()


def verify_password(password: str, hashed: str | None) -> bool:
    if hashed is None:
        bcrypt.checkpw(password.encode(), _DUMMY_HASH)
        return False
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_access_token(user: User) -> tuple[str, int]:
    expires_in = settings.jwt_expire_minutes * 60
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "name": user.full_name,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
        "iss": settings.jwt_issuer,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm), expires_in


_credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Jeton invalide ou expiré",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "exp"]},
        )
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, ValueError):
        raise _credentials_exception

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _credentials_exception
    return user
