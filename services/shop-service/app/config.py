from decimal import Decimal

from pydantic_settings import BaseSettings, SettingsConfigDict

API_PREFIX = "/api/shop"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://shop_user:shop_password@localhost:5433/shop_db"

    # Doit être identique à celui d'auth-service : on vérifie les JWT localement, sans appel réseau
    jwt_secret: str = "dev-only-secret-change-me-in-production-0123456789"
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "novashop-auth"

    # Règles métier
    free_shipping_threshold: Decimal = Decimal("50.00")
    shipping_cost: Decimal = Decimal("4.90")
    max_quantity_per_item: int = 10

    # Insère le catalogue de démonstration si la table des produits est vide
    seed_catalog: bool = True

    cors_origins: str = "http://localhost:8080,http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
