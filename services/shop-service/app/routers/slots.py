import uuid

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy.orm import Session

from .. import slot_service
from ..config import API_PREFIX
from ..database import get_db
from ..schemas import SlotRuleOut, SlotSpinIn, SlotSpinOut
from ..security import CurrentUser, get_current_user

router = APIRouter(prefix=f"{API_PREFIX}/slots", tags=["Machine à sous"])


@router.get("", response_model=list[SlotRuleOut], summary="Mises et chances de gain par rareté")
def list_rules():
    """Public : pour chaque rareté de carte, la mise d'une partie et la probabilité de gagner la carte visée."""
    return slot_service.rules()


@router.post(
    "/spin",
    response_model=SlotSpinOut,
    status_code=status.HTTP_201_CREATED,
    summary="Jouer une partie",
    responses={
        401: {"description": "Jeton absent, invalide ou expiré"},
        404: {"description": "Carte introuvable"},
        409: {"description": "Solde de PokéDollars insuffisant, ou clé d'idempotence déjà utilisée pour une autre carte"},
    },
)
def spin(
    payload: SlotSpinIn,
    idempotency_key: uuid.UUID | None = Header(
        None, description="UUID choisi par le client : une requête rejouée renvoie la même partie sans redébiter"
    ),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Débite la mise correspondant à la rareté de la carte, tire le résultat **côté serveur** et, en cas de gain, ajoute
    la carte à la collection, en une seule transaction.
    """
    return slot_service.spin(db, user.id, payload.card_id, idempotency_key)
