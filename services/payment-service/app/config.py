from pydantic_settings import BaseSettings, SettingsConfigDict

API_PREFIX = "/api/payment"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://payment_user:payment_password@postgres:5432/payment_db"

    # Marchand de démonstration (la boutique NovaShop), créé ou mis à jour au démarrage.
    # La configuration fait foi : changer MERCHANT_API_KEY puis redémarrer suffit à faire tourner la clé.
    seed_merchant: bool = True
    merchant_code: str = "novashop"
    merchant_name: str = "NovaShop"
    merchant_api_key: str = "sk_test_novashop_dev_only_change_me"


settings = Settings()
