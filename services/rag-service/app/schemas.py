import base64
import binascii
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .config import MODEL_ID


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: str
    # Texte simple, ou liste de parties : {"type": "text", "text": …} et fichiers joints
    # {"type": "file", "file": {"filename": …, "file_data": "data:<type>;base64,…"}} (format OpenAI)
    content: str | list[dict[str, Any]] | None = None

    def text(self) -> str:
        if isinstance(self.content, str):
            return self.content
        if isinstance(self.content, list):
            return "".join(p.get("text", "") for p in self.content if p.get("type") == "text")
        return ""

    def files(self) -> list[tuple[str, bytes]]:
        """Fichiers joints au message : (nom, contenu)."""
        if not isinstance(self.content, list):
            return []
        found = []
        for part in self.content:
            if part.get("type") != "file":
                continue
            file = part.get("file") or {}
            name = str(file.get("filename") or "fichier")
            data = str(file.get("file_data") or "")
            if data.startswith("data:"):
                data = data.partition(",")[2]
            try:
                found.append((name, base64.b64decode(data, validate=True)))
            except binascii.Error as exc:
                raise ValueError(f"« {name} » : contenu base64 invalide") from exc
        return found


class ChatCompletionRequest(BaseModel):
    """Sous-ensemble de l'API Chat Completions d'OpenAI : les autres paramètres sont ignorés."""

    model_config = ConfigDict(extra="ignore")

    model: str = MODEL_ID
    messages: list[ChatMessage] = Field(min_length=1)
    stream: bool = False
