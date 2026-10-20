from pydantic_settings import BaseSettings, SettingsConfigDict

API_PREFIX = "/api/auth"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://auth_user:auth_password@localhost:5433/auth_db"

    jwt_secret: str = "dev-only-secret-change-me-in-production-0123456789"
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "novashop-auth"
    jwt_expire_minutes: int = 60

    bcrypt_rounds: int = 12

    # Crée les comptes de démonstration (voir app/seed.py) au démarrage
    seed_demo_users: bool = True

    # Liste séparée par des virgules
    cors_origins: str = "http://localhost:8080,http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
