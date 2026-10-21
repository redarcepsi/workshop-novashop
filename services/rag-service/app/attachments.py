"""
Fichiers joints par l'opérateur dans le chat. Ils sont lus comme les documents de documents/, mais ne sont
ni indexés ni écrits sur disque : ils n'existent que dans la conversation (et dans un petit cache mémoire,
pour ne pas les relire à chaque question).

Un petit fichier est donné en entier au modèle. Un gros fichier dépasserait son contexte : seuls les
passages les plus proches de la question sont retenus, par la même recherche hybride que pour l'index.
"""
import hashlib
import logging
import re
import threading
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from langchain_core.documents import Document
from rank_bm25 import BM25Okapi

from .config import settings
from .indexer import SUPPORTED_EXTENSIONS, UnreadableDocument, fuse, indexer, tokens

logger = logging.getLogger("rag-service")

# En plus des formats de documents/ : les journaux et exports qu'un opérateur veut faire expliquer
EXTENSIONS = SUPPORTED_EXTENSIONS | {".log", ".json", ".csv"}
CACHE_SIZE = 8


@dataclass
class _File:
    chunks: list[Document]
    # Calculés à la première question qui oblige à choisir des passages dans le fichier
    vectors: np.ndarray | None = None


def _clean_name(name: str) -> str:
    # Le nom apparaît dans le prompt et dans la liste des sources, entre accents graves
    return re.sub(r"[`\r\n]", "", Path(name.replace("\\", "/")).name)[:120] or "fichier"


class Attachments:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cache: OrderedDict[str, _File] = OrderedDict()

    def select(self, files: list[tuple[str, bytes]], query: str) -> list[Document]:
        """Extraits des fichiers joints à donner au modèle pour cette question, dans l'ordre des fichiers."""
        read: dict[str, _File] = {}
        for name, data in files:
            digest = hashlib.sha256(data).hexdigest()
            if digest not in read:  # le même fichier joint deux fois n'est lu qu'une fois
                read[digest] = self._read(digest, _clean_name(name), data)
        chunks = [c for file in read.values() for c in file.chunks]
        if sum(len(c.page_content) for c in chunks) <= settings.attachment_max_chars:
            return chunks

        ranked = fuse([self._semantic(query, list(read.values())), self._lexical(query, chunks)], k=len(chunks))
        kept: set[str] = set()
        size = 0
        for chunk in ranked:
            if size + len(chunk.page_content) <= settings.attachment_max_chars:
                kept.add(chunk.id)
                size += len(chunk.page_content)
        return [c for c in chunks if c.id in kept]

    def _read(self, digest: str, name: str, data: bytes) -> _File:
        with self._lock:
            if digest in self._cache:
                self._cache.move_to_end(digest)
                return self._cache[digest]

        if Path(name).suffix.lower() not in EXTENSIONS:
            formats = ", ".join(sorted(EXTENSIONS))
            raise ValueError(f"« {name} » : format non pris en charge (formats lus : {formats})")
        if len(data) > settings.attachment_max_bytes:
            raise ValueError(f"« {name} » dépasse {settings.attachment_max_bytes // (1024 * 1024)} Mo")
        try:
            chunks = indexer.split(name, data)
        except UnreadableDocument as exc:
            raise ValueError(f"« {name} » : {exc}") from exc
        except Exception as exc:
            logger.warning("attachment action=failed error=%r", exc)
            raise ValueError(f"« {name} » : fichier illisible ou endommagé") from exc
        for i, chunk in enumerate(chunks):
            chunk.id = f"{digest[:16]}-{i}"
            chunk.metadata.update(source=name, attachment=True)

        file = _File(chunks)
        with self._lock:
            self._cache[digest] = file
            while len(self._cache) > CACHE_SIZE:
                self._cache.popitem(last=False)
        return file

    @staticmethod
    def _semantic(query: str, files: list[_File]) -> list[Document]:
        for file in files:
            if file.vectors is None:
                titles = [
                    " › ".join(filter(None, [Path(c.metadata["source"]).stem, c.metadata.get("section")]))
                    for c in file.chunks
                ]
                file.vectors = np.array(
                    indexer.embeddings.embed_titled_documents([c.page_content for c in file.chunks], titles)
                )
        chunks = [c for file in files for c in file.chunks]
        vectors = np.vstack([file.vectors for file in files])
        question = np.array(indexer.embeddings.embed_query(query))
        scores = vectors @ question / (np.linalg.norm(vectors, axis=1) * np.linalg.norm(question) + 1e-9)
        return [chunks[i] for i in np.argsort(-scores)]

    @staticmethod
    def _lexical(query: str, chunks: list[Document]) -> list[Document]:
        query_tokens = tokens(query)
        if not query_tokens:
            return []
        scores = BM25Okapi([tokens(c.page_content) for c in chunks]).get_scores(query_tokens)
        return [chunks[i] for i in np.argsort(-scores) if scores[i] > 0]


attachments = Attachments()
