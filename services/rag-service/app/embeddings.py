from langchain_ollama import OllamaEmbeddings


class EmbeddingGemma(OllamaEmbeddings):
    """
    EmbeddingGemma attend un préfixe de tâche, différent pour les documents et pour les questions
    (voir la fiche du modèle) : sans lui, la recherche documentaire est nettement moins pertinente.
    Ollama ne l'ajoute pas lui-même.
    """

    def embed_titled_documents(self, texts: list[str], titles: list[str]) -> list[list[float]]:
        """Format recommandé pour un document : son titre (ici fichier › section) aide à le situer."""
        return self._embed([f"title: {title} | text: {text}" for text, title in zip(texts, titles)])

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed([f"title: none | text: {t}" for t in texts])

    def embed_query(self, text: str) -> list[float]:
        # OllamaEmbeddings.embed_query passe par embed_documents : on l'appelle directement pour
        # ne pas cumuler les deux préfixes
        return self._embed([f"task: search result | query: {text}"])[0]

    async def aembed_documents(self, texts: list[str]) -> list[list[float]]:
        return await OllamaEmbeddings.aembed_documents(self, [f"title: none | text: {t}" for t in texts])

    async def aembed_query(self, text: str) -> list[float]:
        return (await OllamaEmbeddings.aembed_documents(self, [f"task: search result | query: {text}"]))[0]

    def _embed(self, texts: list[str]) -> list[list[float]]:
        return OllamaEmbeddings.embed_documents(self, texts)
