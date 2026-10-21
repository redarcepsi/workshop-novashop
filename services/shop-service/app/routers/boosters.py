import uuid

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import booster_service
from ..config import API_PREFIX
from ..database import get_db
from ..models import Booster
from ..schemas import BoosterOpeningOut, BoosterOut
from ..security import CurrentUser, get_current_user

router = APIRouter(prefix=f"{API_PREFIX}/boosters", tags=["Boosters"])


@router.get("", response_model=list[BoosterOut], summary="Lister les boosters")
def list_boosters(db: Session = Depends(get_db)):
    """Public : prix en PokéDollars, sets concernés et probabilité d'obtenir chaque rareté."""
    return booster_service.describe(db, db.scalars(select(Booster).order_by(Booster.position)).all())


@router.post(
    "/{slug}/open",
    response_model=BoosterOpeningOut,
    status_code=status.HTTP_201_CREATED,
    summary="Acheter et ouvrir un booster",
    responses={
        401: {"description": "Jeton absent, invalide ou expiré"},
        404: {"description": "Booster introuvable"},
        409: {"description": "Solde de PokéDollars insuffisant, ou clé d'idempotence déjà utilisée pour un autre booster"},
    },
)
def open_booster(
    slug: str,
    idempotency_key: uuid.UUID | None = Header(
        None, description="UUID choisi par le client : une requête rejouée renvoie la même ouverture sans redébiter"
    ),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Débite le prix du booster sur le porte-monnaie, tire les cartes **côté serveur** et les ajoute à la collection,
    en une seule transaction. Les cartes sont renvoyées dans l'ordre de révélation (la plus rare en dernier).
    """
    return booster_service.open_booster(db, user.id, slug, idempotency_key)
