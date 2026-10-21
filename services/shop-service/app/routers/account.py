from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import collection_service, wallet_service
from ..config import API_PREFIX
from ..database import get_db
from ..schemas import CollectionOut, WalletOut
from ..security import CurrentUser, get_current_user

router = APIRouter(prefix=API_PREFIX, responses={401: {"description": "Jeton absent, invalide ou expiré"}})


@router.get("/wallet", response_model=WalletOut, summary="Mon porte-monnaie de PokéDollars", tags=["PokéDollars"])
def get_wallet(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Solde et derniers mouvements : achats de PokéDollars, ouvertures de boosters, annulations."""
    return wallet_service.summary(db, user.id)


@router.get("/collection", response_model=CollectionOut, summary="Ma collection", tags=["Collection"])
def get_collection(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Cartes possédées avec leur nombre d'exemplaires, avancement par set et valeur au prix de la boutique."""
    return collection_service.summary(db, user.id)
