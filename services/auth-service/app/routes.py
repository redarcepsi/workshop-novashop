from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import API_PREFIX, settings
from .database import get_db
from .models import User
from .schemas import DemoOut, HealthOut, Token, UserCreate, UserOut
from .security import create_access_token, get_current_user, hash_password, verify_password
from .seed import DEMO_USERS

router = APIRouter(prefix=API_PREFIX)


@router.get("/health", response_model=HealthOut, tags=["Système"], summary="Sonde de santé")
def health():
    return {"status": "ok", "service": "auth-service"}


@router.get("/demo", response_model=DemoOut, tags=["Système"], summary="Mode démonstration")
def demo():
    """
    Comptes de démo proposés en un clic sur la page de connexion ; `enabled` affiche aussi les cartes de test
    au paiement. Avec `SEED_DEMO_USERS=false` : `enabled` à false et aucun compte.
    """
    if not settings.seed_demo_users:
        return {"enabled": False, "accounts": []}
    return {"enabled": True, "accounts": DEMO_USERS}


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    tags=["Authentification"],
    summary="Créer un compte",
    responses={409: {"description": "Email déjà utilisé"}},
)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    """Crée un utilisateur. Le mot de passe est haché avec **bcrypt** avant stockage."""
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Un compte existe déjà avec cet email")
    db.refresh(user)
    return user


@router.post(
    "/login",
    response_model=Token,
    tags=["Authentification"],
    summary="Se connecter (OAuth2 password flow)",
    responses={401: {"description": "Identifiants invalides"}},
)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    Corps `application/x-www-form-urlencoded` : `username` (= email) et `password`.

    Retourne un **JWT** (HS256) à envoyer ensuite dans l'en-tête `Authorization: Bearer <token>`.
    """
    user = db.scalar(select(User).where(User.email == form.username.strip().lower()))
    if not verify_password(form.password, user.hashed_password if user else None) or not user.is_active:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Email ou mot de passe incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token, expires_in = create_access_token(user)
    return Token(access_token=token, expires_in=expires_in)


@router.get(
    "/me",
    response_model=UserOut,
    tags=["Utilisateurs"],
    summary="Profil de l'utilisateur connecté",
    responses={401: {"description": "Jeton absent, invalide ou expiré"}},
)
def me(current_user: User = Depends(get_current_user)):
    return current_user
