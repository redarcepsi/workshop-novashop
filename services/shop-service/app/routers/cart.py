from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import cart_service
from ..config import API_PREFIX
from ..database import get_db
from ..schemas import CartItemIn, CartItemsIn, CartOut, CartQuantityIn
from ..security import CurrentUser, get_current_user

router = APIRouter(prefix=f"{API_PREFIX}/cart", tags=["Panier"])

_UNAUTHORIZED = {401: {"description": "Jeton absent, invalide ou expiré"}}
_CONFLICT = {409: {"description": "Stock insuffisant ou quantité maximale atteinte"}}


@router.get("", response_model=CartOut, summary="Mon panier", responses=_UNAUTHORIZED)
def get_cart(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Contenu du panier, total et PokéDollars à recevoir, calculés côté serveur."""
    return cart_service.get_cart(db, user.id)


@router.post(
    "/items",
    response_model=CartOut,
    summary="Ajouter un article",
    responses={**_UNAUTHORIZED, **_CONFLICT, 404: {"description": "Produit introuvable"}},
)
def add_item(payload: CartItemIn, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Ajoute la quantité à celle déjà présente dans le panier."""
    return cart_service.add_item(db, user.id, payload.product_id, payload.quantity)


@router.patch(
    "/items/{product_id}",
    response_model=CartOut,
    summary="Modifier la quantité",
    responses={**_UNAUTHORIZED, **_CONFLICT, 404: {"description": "Article absent du panier"}},
)
def update_item(
    product_id: int,
    payload: CartQuantityIn,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return cart_service.set_quantity(db, user.id, product_id, payload.quantity)


@router.delete("/items/{product_id}", response_model=CartOut, summary="Retirer un article", responses=_UNAUTHORIZED)
def remove_item(product_id: int, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return cart_service.remove_item(db, user.id, product_id)


@router.delete("", response_model=CartOut, summary="Vider le panier", responses=_UNAUTHORIZED)
def clear_cart(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return cart_service.clear(db, user.id)


@router.post("/merge", response_model=CartOut, summary="Fusionner un panier invité", responses=_UNAUTHORIZED)
def merge_cart(payload: CartItemsIn, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Appelé juste après la connexion : les articles ajoutés en tant qu'invité sont versés
    dans le panier du compte. Les quantités sont plafonnées au stock disponible.
    """
    return cart_service.merge(db, user.id, payload.items)


@router.post("/quote", response_model=CartOut, summary="Chiffrer un panier invité")
def quote_cart(payload: CartItemsIn, db: Session = Depends(get_db)):
    """
    **Sans authentification.** Le front stocke le panier d'un visiteur non connecté en local
    (`product_id` + `quantity`) et demande ici les prix, stocks et totaux à jour.
    Les produits inconnus sont ignorés.
    """
    return cart_service.quote(db, payload.items)
