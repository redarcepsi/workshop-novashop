from pydantic_settings import BaseSettings, SettingsConfigDict

API_PREFIX = "/api/shop"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://shop_user:shop_password@postgres:5432/shop_db"

    # Doit être identique à celui d'auth-service : on vérifie les JWT localement, sans appel réseau
    jwt_secret: str = "dev-only-secret-change-me-in-production-0123456789"
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "novashop-auth"

    # Plateforme de paiement (payment-service) : PokéBling y est un marchand, identifié par sa clé API
    payment_service_url: str = "http://payment-service:8000"
    payment_api_key: str = "sk_test_novashop_dev_only_change_me"
    payment_timeout: float = 3.0  # secondes, par tentative : les produits restent verrouillés pendant l'appel
    payment_attempts: int = 2     # sans risque de double débit grâce à la clé d'idempotence

    # Règles métier
    max_quantity_per_item: int = 10

    # Insère le catalogue (cartes, lots de PokéDollars, boosters) si la table des cartes est vide
    seed_catalog: bool = True

    cors_origins: str = "http://localhost:8080,http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
