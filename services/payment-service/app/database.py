import logging
import time

from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

logger = logging.getLogger("payment-service")

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(retries: int = 15, delay: float = 2.0) -> None:
    """Crée les tables (pour un vrai projet : migrations Alembic) puis le marchand de démo."""
    from . import models  # noqa: F401  (enregistre les modèles sur Base.metadata)

    for attempt in range(1, retries + 1):
        try:
            Base.metadata.create_all(bind=engine)
            break
        except OperationalError:
            logger.warning("Base indisponible (tentative %s/%s), nouvel essai dans %ss", attempt, retries, delay)
            time.sleep(delay)
    else:
        raise RuntimeError("Impossible de se connecter à la base de données")

    if settings.seed_merchant:
        from .seed import seed_merchant

        with SessionLocal() as db:
            seed_merchant(db)
