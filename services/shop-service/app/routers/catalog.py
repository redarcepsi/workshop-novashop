import enum

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..config import API_PREFIX
from ..database import get_db
from ..models import Category, Product
from ..schemas import CategoryOut, ProductOut, ProductPage

router = APIRouter(prefix=API_PREFIX, tags=["Catalogue"])


class SortOption(str, enum.Enum):
    popular = "popular"
    price_asc = "price_asc"
    price_desc = "price_desc"
    rating = "rating"
    newest = "newest"


SORTS = {
    SortOption.popular: [Product.reviews_count.desc()],
    SortOption.price_asc: [Product.price.asc()],
    SortOption.price_desc: [Product.price.desc()],
    SortOption.rating: [Product.rating.desc(), Product.reviews_count.desc()],
    SortOption.newest: [Product.created_at.desc()],
}


@router.get("/categories", response_model=list[CategoryOut], summary="Lister les catégories")
def list_categories(db: Session = Depends(get_db)):
    rows = db.execute(
        select(Category, func.count(Product.id))
        .outerjoin(Product, Product.category_id == Category.id)
        .group_by(Category.id)
        .order_by(Category.position)
    ).all()
    return [
        CategoryOut(slug=c.slug, name=c.name, emoji=c.emoji, product_count=count) for c, count in rows
    ]


@router.get("/products", response_model=ProductPage, summary="Rechercher des produits")
def list_products(
    category: str | None = Query(None, description="Slug de catégorie", examples=["audio"]),
    q: str | None = Query(None, max_length=100, description="Recherche dans le nom et la description"),
    featured: bool | None = Query(None, description="Uniquement les coups de cœur"),
    on_sale: bool | None = Query(None, description="Uniquement les produits en promotion"),
    in_stock: bool | None = Query(None, description="Masquer les produits en rupture"),
    sort: SortOption = Query(SortOption.popular),
    limit: int = Query(12, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Catalogue public (sans authentification), filtrable, triable et paginé."""
    conditions = []
    if category:
        conditions.append(Product.category.has(Category.slug == category))
    if q and q.strip():
        term = q.strip()
        conditions.append(
            or_(Product.name.icontains(term, autoescape=True), Product.description.icontains(term, autoescape=True))
        )
    if featured is not None:
        conditions.append(Product.is_featured.is_(featured))
    if on_sale:
        conditions.append(Product.compare_at_price > Product.price)
    if in_stock:
        conditions.append(Product.stock > 0)

    total = db.scalar(select(func.count()).select_from(Product).where(*conditions))
    items = db.scalars(
        select(Product).where(*conditions).order_by(*SORTS[sort], Product.id).limit(limit).offset(offset)
    ).all()
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
