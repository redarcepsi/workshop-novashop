import enum

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..config import API_PREFIX
from ..database import get_db
from ..models import Card, CardSet, Product, ProductKind, Rarity
from ..schemas import CardOut, ProductOut, ProductPage, SetOut

router = APIRouter(prefix=API_PREFIX, tags=["Catalogue"])


class SortOption(str, enum.Enum):
    featured = "featured"
    price_asc = "price_asc"
    price_desc = "price_desc"
    rarity = "rarity"
    number = "number"
    name = "name"
    newest = "newest"


# Card et CardSet sont joints explicitement (jointure externe : les lots de PokéDollars n'ont pas de carte)
SORTS = {
    SortOption.featured: [Product.is_featured.desc(), Card.rarity.desc().nulls_last(), Product.price.desc()],
    SortOption.price_asc: [Product.price.asc()],
    SortOption.price_desc: [Product.price.desc()],
    SortOption.rarity: [Card.rarity.desc().nulls_last(), Product.price.desc()],
    SortOption.number: [CardSet.position, Card.number],
    SortOption.name: [Product.name],
    SortOption.newest: [CardSet.release_date.desc().nulls_last(), Card.number],
}


@router.get("/sets", response_model=list[SetOut], summary="Lister les sets de cartes")
def list_sets(db: Session = Depends(get_db)):
    rows = db.execute(
        select(CardSet, func.count(Card.id))
        .outerjoin(Card, Card.set_id == CardSet.id)
        .group_by(CardSet.id)
        .order_by(CardSet.position)
    ).all()
    return [SetOut.model_validate(s).model_copy(update={"card_count": count}) for s, count in rows]


@router.get(
    "/sets/{set_id}/cards",
    response_model=list[CardOut],
    summary="Toutes les cartes d'un set",
    responses={404: {"description": "Set introuvable"}},
)
def list_set_cards(set_id: str, db: Session = Depends(get_db)):
    """Liste complète, dans l'ordre du set : sert à afficher les cartes manquantes d'une collection."""
    if db.get(CardSet, set_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Set introuvable")
    return db.scalars(select(Card).where(Card.set_id == set_id).order_by(Card.number)).all()


@router.get("/products", response_model=ProductPage, summary="Rechercher des produits")
def list_products(
    kind: ProductKind | None = Query(None, description="`CARD` : cartes à l'unité, `POKEDOLLARS` : lots de PokéDollars"),
    set_id: str | None = Query(None, alias="set", description="Identifiant de set", examples=["base1"]),
    rarity: Rarity | None = Query(None),
    type: str | None = Query(None, max_length=20, description="Type de Pokémon", examples=["Feu"]),
    category: str | None = Query(None, max_length=20, description="Pokémon, Dresseur ou Énergie"),
    q: str | None = Query(None, max_length=100, description="Recherche dans le nom de la carte et du set"),
    featured: bool | None = Query(None, description="Uniquement les coups de cœur"),
    on_sale: bool | None = Query(None, description="Uniquement les produits en promotion"),
    in_stock: bool | None = Query(None, description="Masquer les produits en rupture"),
    sort: SortOption = Query(SortOption.featured),
    limit: int = Query(24, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Catalogue public (sans authentification), filtrable, triable et paginé."""
    conditions = []
    if kind:
        conditions.append(Product.kind == kind)
    if set_id:
        conditions.append(Card.set_id == set_id)
    if rarity:
        conditions.append(Card.rarity == rarity)
    if type:
        conditions.append(Card.types.contains([type]))
    if category:
        conditions.append(Card.category == category)
    if q and q.strip():
        term = q.strip()
        conditions.append(or_(Product.name.icontains(term, autoescape=True), CardSet.name.icontains(term, autoescape=True)))
    if featured is not None:
        conditions.append(Product.is_featured.is_(featured))
    if on_sale:
        conditions.append(Product.compare_at_price > Product.price)
    if in_stock:
        conditions.append(or_(Product.stock.is_(None), Product.stock > 0))

    def base(stmt):
        return (
            stmt.outerjoin(Card, Product.card_id == Card.id)
            .outerjoin(CardSet, Card.set_id == CardSet.id)
            .where(*conditions)
        )

    total = db.scalar(base(select(func.count()).select_from(Product)))
    items = db.scalars(base(select(Product)).order_by(*SORTS[sort], Product.id).limit(limit).offset(offset)).all()
    return ProductPage(items=items, total=total, limit=limit, offset=offset)


@router.get(
    "/products/{slug}",
    response_model=ProductOut,
    summary="Détail d'un produit",
    responses={404: {"description": "Produit introuvable"}},
)
def get_product(slug: str, db: Session = Depends(get_db)):
    product = db.scalar(select(Product).where(Product.slug == slug))
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produit introuvable")
    return product
