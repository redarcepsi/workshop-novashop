import logging
import time

from sqlalchemy import Enum, create_engine, inspect, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

logger = logging.getLogger("shop-service")

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


def _drop_legacy_schema() -> None:
    """Supprime les tables de l'ancienne boutique NovaShop (body pillows), que create_all ne sait pas transformer.

    Elles se reconnaissent à la table products sans colonne kind. Les transactions de payment-service ne sont pas
    touchées : elles sont dans une autre base.
    """
    inspector = inspect(engine)
    if not inspector.has_table("products") or "kind" in {c["name"] for c in inspector.get_columns("products")}:
        return
    logger.warning("Tables de l'ancienne boutique NovaShop détectées : suppression avant la création de PokéBling")
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS order_items, orders, cart_items, products, categories CASCADE"))
        conn.execute(text("DROP TYPE IF EXISTS order_status"))


def _add_enum_values() -> None:
    """create_all crée les types enum manquants mais ne touche pas à ceux qui existent : ajoute les valeurs apparues
    depuis leur création (SLOT dans wallet_reason, par exemple). Sans effet sur une valeur déjà présente."""
    enums = {
        column.type.name: column.type.enums
        for table in Base.metadata.tables.values()
        for column in table.columns
        if isinstance(column.type, Enum)
    }
    with engine.begin() as conn:
        for name, values in enums.items():
            for value in values:
                conn.execute(text(f"ALTER TYPE {name} ADD VALUE IF NOT EXISTS '{value}'"))


def init_db(retries: int = 15, delay: float = 2.0) -> None:
    """Crée les tables (pour un vrai projet : migrations Alembic) puis le catalogue de démo."""
    from . import models  # noqa: F401  (enregistre les modèles sur Base.metadata)

    for attempt in range(1, retries + 1):
        try:
            _drop_legacy_schema()
            Base.metadata.create_all(bind=engine)
            _add_enum_values()
            break
        except OperationalError:
            logger.warning("Base indisponible (tentative %s/%s), nouvel essai dans %ss", attempt, retries, delay)
            time.sleep(delay)
    else:
        raise RuntimeError("Impossible de se connecter à la base de données")

    if settings.seed_catalog:
        from .seed import seed_catalog

        with SessionLocal() as db:
            seed_catalog(db)
