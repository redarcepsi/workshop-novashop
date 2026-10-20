import enum

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import art
from ..config import API_PREFIX
from ..database import get_db
from ..models import Product

router = APIRouter(prefix=f"{API_PREFIX}/media", tags=["Médias"])


class View(str, enum.Enum):
    pair = "pair"
    front = "front"
    back = "back"


@router.get(
    "/{slug}.svg",
    summary="Visuel d'un produit (SVG)",
    response_class=Response,
    responses={200: {"content": {"image/svg+xml": {}}}, 404: {"description": "Produit sans visuel généré"}},
)
def product_image(
    slug: str,
    view: View = Query(View.pair, description="`pair` : recto et verso, `front` : recto, `back` : verso (version nuit)"),
    db: Session = Depends(get_db),
):
    """Illustration du body pillow, générée à la volée à partir de la fiche d'apparence du produit."""
    product = db.scalar(select(Product).where(Product.slug == slug))
    if product is None or not product.art:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visuel introuvable")
    return Response(
        content=art.render(product.art, view.value, seed=slug),
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=600"},
    )
