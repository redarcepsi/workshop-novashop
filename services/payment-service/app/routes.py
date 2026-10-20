from fastapi import APIRouter, Depends, Header, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import transaction_service
from .config import API_PREFIX
from .database import get_db
from .models import Merchant, Transaction, TransactionStatus
from .schemas import HealthOut, PaymentCreate, TransactionOut, TransactionPage
from .security import get_current_merchant

router = APIRouter(prefix=API_PREFIX)

_UNAUTHORIZED = {401: {"description": "Clé API absente ou invalide"}}
_NOT_FOUND = {404: {"description": "Transaction introuvable"}}


@router.get("/health", response_model=HealthOut, tags=["Système"], summary="Sonde de santé")
def health():
    return {"status": "ok", "service": "payment-service"}


@router.post(
    "/transactions",
    response_model=TransactionOut,
    status_code=status.HTTP_201_CREATED,
    tags=["Transactions"],
    summary="Payer par carte",
    responses={
        **_UNAUTHORIZED,
        200: {"description": "Requête rejouée avec la même clé d'idempotence : transaction d'origine"},
        402: {"description": "Paiement refusé (cartes de test 4000 0000 0000 0002 / 9995, carte expirée)"},
        409: {"description": "Clé d'idempotence déjà utilisée pour un autre paiement"},
    },
)
def create_transaction(
    payload: PaymentCreate,
    response: Response,
    idempotency_key: str | None = Header(
        default=None,
        pattern=r"^[A-Za-z0-9_.:-]{1,64}$",
        description="Clé unique choisie par le marchand (ex. numéro de commande) : rejouer la requête ne débite pas deux fois",
    ),
    merchant: Merchant = Depends(get_current_merchant),
    db: Session = Depends(get_db),
):
    """
    Autorise puis capture le paiement en une étape. Le refus de la banque émettrice est une réponse normale :
    la transaction est enregistrée (statut `DECLINED`) et l'API répond **402** avec le motif dans `detail`.

    Cartes de test : `4242 4242 4242 4242` acceptée, `4000 0000 0000 0002` refusée,
    `4000 0000 0000 9995` fonds insuffisants.
    """
    tx, replayed = transaction_service.create(db, merchant, payload, idempotency_key)
    headers = {"Idempotent-Replayed": "true"} if replayed else {}

    if tx.status is TransactionStatus.DECLINED:
        body = {"detail": tx.decline_message, "transaction": TransactionOut.model_validate(tx).model_dump(mode="json")}
        return JSONResponse(body, status_code=status.HTTP_402_PAYMENT_REQUIRED, headers=headers)

    response.headers.update(headers)
    if replayed:
        response.status_code = status.HTTP_200_OK
    return tx


@router.get(
    "/transactions",
    response_model=TransactionPage,
    tags=["Transactions"],
    summary="Mes transactions",
    responses=_UNAUTHORIZED,
)
def list_transactions(
    status_filter: TransactionStatus | None = Query(None, alias="status"),
    merchant_reference: str | None = Query(None, max_length=64),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    merchant: Merchant = Depends(get_current_merchant),
    db: Session = Depends(get_db),
):
    """Transactions du marchand authentifié uniquement, des plus récentes aux plus anciennes."""
    stmt = select(Transaction).where(Transaction.merchant_id == merchant.id)
    if status_filter is not None:
        stmt = stmt.where(Transaction.status == status_filter)
    if merchant_reference:
        stmt = stmt.where(Transaction.merchant_reference == merchant_reference)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = db.scalars(stmt.order_by(Transaction.created_at.desc()).limit(limit).offset(offset)).all()
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get(
    "/transactions/{reference}",
    response_model=TransactionOut,
    tags=["Transactions"],
    summary="Détail d'une transaction",
    responses={**_UNAUTHORIZED, **_NOT_FOUND},
)
def get_transaction(reference: str, merchant: Merchant = Depends(get_current_merchant), db: Session = Depends(get_db)):
    return transaction_service.get(db, merchant, reference)


@router.post(
    "/transactions/{reference}/refund",
    response_model=TransactionOut,
    tags=["Transactions"],
    summary="Rembourser une transaction",
    responses={**_UNAUTHORIZED, **_NOT_FOUND, 409: {"description": "Transaction non capturée"}},
)
def refund_transaction(reference: str, merchant: Merchant = Depends(get_current_merchant), db: Session = Depends(get_db)):
    """Remboursement intégral. Idempotent : une transaction déjà remboursée est renvoyée telle quelle."""
    return transaction_service.refund(db, merchant, reference)
