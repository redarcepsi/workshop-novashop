import uuid

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import booster_service, daily_service
from ..config import API_PREFIX
from ..database import get_db
from ..models import Booster
from ..schemas import BoosterBatchOut, BoosterOpeningOut, BoosterOut, DailyBoosterOut
from ..security import CurrentUser, get_current_user

router = APIRouter(prefix=f"{API_PREFIX}/boosters", tags=["Boosters"])


@router.get("", response_model=list[BoosterOut], summary="Lister les boosters")
def list_boosters(db: Session = Depends(get_db)):
    """Public : prix en PokéDollars, sets concernés et probabilité d'obtenir chaque rareté."""
    return booster_service.describe(db, db.scalars(select(Booster).order_by(Booster.position)).all())


@router.get(
    "/daily",
    response_model=DailyBoosterOut,
    summary="Mon booster du jour",
    responses={401: {"description": "Jeton absent, invalide ou expiré"}},
)
def get_daily_booster(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Le booster offert aujourd'hui : tiré au hasard parmi les boosters d'un seul set (hors édition premium), il reste
    le même toute la journée. Indique s'il a déjà été ouvert et quand le suivant sera disponible (minuit, heure de
    Paris).
    """
    return daily_service.summary(db, user.id)


@router.post(
    "/daily",
    response_model=BoosterOpeningOut,
    status_code=status.HTTP_201_CREATED,
    summary="Ouvrir mon booster du jour",
    responses={401: {"description": "Jeton absent, invalide ou expiré"}},
)
def open_daily_booster(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Ouvre gratuitement le booster du jour : cartes tirées **côté serveur** et ajoutées à la collection, rien n'est
    débité. Un seul par jour et par joueur : une fois ouvert, l'appel renvoie la même ouverture.
    """
    return daily_service.claim(db, user.id)


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


@router.post(
    "/{slug}/open-batch",
    response_model=BoosterBatchOut,
    status_code=status.HTTP_201_CREATED,
    summary="Acheter et ouvrir plusieurs boosters d'un coup",
    responses={
        401: {"description": "Jeton absent, invalide ou expiré"},
        404: {"description": "Booster introuvable"},
        409: {"description": "Solde insuffisant pour tous les boosters, ou clé d'idempotence déjà utilisée"},
    },
)
def open_batch(
    slug: str,
    count: int = Query(booster_service.MAX_BATCH, ge=1, le=booster_service.MAX_BATCH, description="Nombre de boosters"),
    idempotency_key: uuid.UUID | None = Header(
        None, description="UUID choisi par le client : une requête rejouée renvoie les mêmes ouvertures sans redébiter"
    ),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Ouvre `count` boosters identiques (5 par défaut) dans une seule transaction : tous sont payés et ouverts, ou
    aucun (solde insuffisant pour le lot : 409, rien n'est débité). Une carte n'est « nouvelle » qu'une fois dans le
    lot.
    """
    return booster_service.open_boosters(db, user.id, slug, idempotency_key, count)
