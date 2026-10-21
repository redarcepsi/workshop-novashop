from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

API_PREFIX = "/api/rag"

# Identifiant de l'assistant dans l'API compatible OpenAI (/v1/models)
MODEL_ID = "assistant-resilience"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ollama_base_url: str = "http://ollama:11434"
    llm_model: str = "gemma4:e4b"
    embedding_model: str = "embeddinggemma:latest"
    # Réponses factuelles : peu de créativité
    llm_temperature: float = 0.2
    llm_num_ctx: int = 8192
    # Mode "réflexion" de Gemma 4 : environ 10 s de plus, mais il évite les contresens à la lecture des
    # extraits (négations, tableaux). La réflexion est affichée en direct dans l'interface
    llm_think: bool = True
    # Modèle jamais déchargé : sur processeur, le recharger prend plus de 3 minutes. "-1m" et non "-1" :
    # dans une requête, Ollama exige une unité
    llm_keep_alive: str = "-1m"

    # Dossiers indexés, séparés par des virgules (montés en lecture seule dans le conteneur)
    documents_dirs: str = "/data/documents,/data/project"
    chroma_dir: str = "/data/chroma"
    chunk_size: int = 1000
    chunk_overlap: int = 150
    # 3 extraits plutôt que 5 : un prompt plus court, donc une réponse qui commence plus tôt sur processeur
    retrieval_k: int = 3
    # Fichiers joints dans le chat : donnés en entier au modèle jusqu'à cette taille de texte, au-delà
    # seuls les passages les plus proches de la question (le contexte du modèle est de llm_num_ctx jetons)
    attachment_max_chars: int = 6000
    attachment_max_bytes: int = 10 * 1024 * 1024
    # Docker Desktop ne relaie pas les notifications de fichiers de Windows : on scrute le dossier
    sync_interval_seconds: int = 30

    # Clé partagée avec l'interface de chat : en-tête "Authorization: Bearer <clé>"
    rag_api_key: str = "rag_dev_only_change_me"

    @property
    def documents_roots(self) -> list[Path]:
        return [Path(p.strip()) for p in self.documents_dirs.split(",") if p.strip()]


settings = Settings()
