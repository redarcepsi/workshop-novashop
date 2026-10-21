import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import order_service
from ..config import API_PREFIX
from ..database import get_db
from ..models import Order
from ..schemas import CheckoutRequest, OrderOut
from ..security import CurrentUser, get_current_user

router = APIRouter(prefix=f"{API_PREFIX}/orders", tags=["Commandes"])

_UNAUTHORIZED = {401: {"description": "Jeton absent, invalide ou expiré"}}
_NOT_FOUND = {404: {"description": "Commande introuvable"}}


@router.post(
    "",
    response_model=OrderOut,
    status_code=status.HTTP_201_CREATED,
    summary="Passer commande (payer le panier)",
    responses={
        **_UNAUTHORIZED,
        400: {"description": "Panier vide"},
        402: {"description": "Paiement refusé (cartes de test 4000 0000 0000 0002 / 9995)"},
        409: {"description": "Stock insuffisant"},
        502: {"description": "Réponse inattendue de la plateforme de paiement"},
        503: {"description": "Plateforme de paiement indisponible : rien n'est débité, le panier est conservé"},
    },
)
def checkout(payload: CheckoutRequest, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Transforme le panier en commande, en une seule transaction :

    1. vérifie le stock de chaque article (lignes verrouillées) ;
    2. calcule le total côté serveur ;
    3. fait débiter la carte par la plateforme de paiement (`payment-service`), le numéro de commande servant
       de clé d'idempotence ;
    4. décrémente le stock, crée la commande, vide le panier et livre aussitôt : cartes dans la collection,
       PokéDollars sur le porte-monnaie.

    Cartes de test : `4242 4242 4242 4242` acceptée, `4000 0000 0000 0002` refusée.
    """
    return order_service.checkout(db, user, payload)


@router.get("", response_model=list[OrderOut], summary="Mes commandes", responses=_UNAUTHORIZED)
def list_orders(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc()).limit(100)).all()


@router.get(
    "/{order_id}",
    response_model=OrderOut,
    summary="Détail d'une commande",
    responses={**_UNAUTHORIZED, **_NOT_FOUND},
)
def get_order(order_id: uuid.UUID, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return order_service.get_user_order(db, user.id, order_id)


@router.post(
    "/{order_id}/cancel",
    response_model=OrderOut,
    summary="Annuler une commande",
    responses={
        **_UNAUTHORIZED,
        **_NOT_FOUND,
        409: {"description": "Commande déjà annulée, PokéDollars déjà dépensés ou cartes absentes de la collection"},
        502: {"description": "Remboursement refusé par la plateforme de paiement"},
        503: {"description": "Plateforme de paiement indisponible : la commande reste payée"},
    },
)
def cancel_order(order_id: uuid.UUID, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Fait rembourser la commande par la plateforme de paiement, puis l'annule : les cartes achetées quittent la
    collection (et reviennent en stock), les PokéDollars achetés sont repris. Refusée (409) si ces PokéDollars
    ont déjà été dépensés.
    """
    return order_service.cancel(db, user.id, order_id)
