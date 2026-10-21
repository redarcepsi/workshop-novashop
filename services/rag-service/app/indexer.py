"""
Indexation des documents de l'équipe : chargement, découpage en extraits, vectorisation et stockage
dans Chroma. Le dossier est scruté en continu : un fichier ajouté, modifié ou supprimé est pris en
compte au cycle suivant, sans redémarrage.

La recherche est hybride : sémantique (embeddings) et lexicale (BM25), fusionnées par rang (RRF).
Les questions d'exploitation contiennent des noms exacts (payment-service, 503, nom d'une alerte) que
la recherche sémantique seule classe mal.
"""
import hashlib
import io
import logging
import re
import threading
from collections import Counter
from pathlib import Path

import chromadb
import docx2txt
from chromadb.config import Settings as ChromaSettings
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_text_splitters import Language, MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from pypdf import PdfReader
from rank_bm25 import BM25Okapi

from .config import settings
from .embeddings import EmbeddingGemma

logger = logging.getLogger("rag-service")

MARKDOWN_EXTENSIONS = {".md", ".markdown"}
TEXT_EXTENSIONS = {".txt", ".yml", ".yaml"}
SUPPORTED_EXTENSIONS = MARKDOWN_EXTENSIONS | TEXT_EXTENSIONS | {".pdf", ".docx"}
MAX_FILE_BYTES = 25 * 1024 * 1024
# À incrémenter quand la façon d'indexer change (préfixes, métadonnées) : tout est alors réindexé
INDEX_FORMAT = 2
MARKDOWN_HEADERS = [("#", "h1"), ("##", "h2"), ("###", "h3")]
# Fusion par rang (Reciprocal Rank Fusion) : valeur usuelle de la constante de lissage
RRF_K = 60
STEM_LENGTH = 7
STOPWORDS = set(
    "le la les l un une des du de d et ou en est sont sur pour par dans au aux à ce cet cette ces se sa son ses "
    "il elle ils on ne pas plus que qui quoi quel quels quelle quelles comment pourquoi quand y a avec sans "
    "faut doit je tu nous vous mon ma mes notre nos votre vos".split()
)


class UnreadableDocument(Exception):
    """Le fichier ne peut pas être indexé tel quel : il ne sera réessayé que s'il change."""


def _ignored(relative: Path) -> bool:
    # Fichiers cachés (.gitkeep…), notes de l'équipe préfixées par "_" et fichiers temporaires de Word (~$…)
    return any(part.startswith((".", "_", "~$")) for part in relative.parts)


def _decode(data: bytes) -> str:
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="replace")  # fichier enregistré par un éditeur Windows


def _stem(word: str) -> str:
    # Racinisation grossière par troncature : paiement(s) → paiemen, idempoten(ce|ts) → idempot
    if len(word) > 4 and word[-1] in "sx":
        word = word[:-1]
    return word[:STEM_LENGTH]


def tokens(text: str) -> list[str]:
    tokens: list[str] = []
    for word in re.findall(r"[\w-]+", text.lower()):
        if word in STOPWORDS:
            continue
        if "-" in word or any(ch.isdigit() for ch in word):
            # Identifiant (payment-db, 503, sk_test_…) : gardé exact, et ses parties pour "payment service"
            tokens.append(word)
            tokens.extend(_stem(part) for part in word.split("-") if part and part not in STOPWORDS)
        else:
            tokens.append(_stem(word))
    return tokens


def fuse(rankings: list[list[Document]], k: int) -> list[Document]:
    """Les k meilleurs documents de plusieurs classements, fusionnés par rang (RRF). Documents identifiés par .id"""
    scores: dict[str, float] = {}
    documents: dict[str, Document] = {}
    for ranking in rankings:
        for rank, document in enumerate(ranking):
            scores[document.id] = scores.get(document.id, 0.0) + 1 / (RRF_K + rank + 1)
            documents[document.id] = document
    best = sorted(scores, key=scores.get, reverse=True)[:k]
    return [documents[i] for i in best]


def _title(chunk: Document) -> str:
    name = Path(chunk.metadata["source"]).stem
    return f"{name} › {chunk.metadata['section']}" if chunk.metadata.get("section") else name


def _collection_name() -> str:
    # Un modèle d'embedding par collection : changer de modèle repart d'un index propre
    return "docs-" + re.sub(r"[^a-zA-Z0-9]+", "-", settings.embedding_model).strip("-").lower()


class Indexer:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stop = threading.Event()
        # Changer le découpage change l'empreinte de tous les fichiers, donc force leur réindexation
        self._split_signature = f"{INDEX_FORMAT}:{settings.chunk_size}:{settings.chunk_overlap}".encode()
        self._failed: dict[str, str] = {}
        self.errors: dict[str, str] = {}
        self._lexical: tuple[BM25Okapi, list[Document]] | None = None
        self._collection = None
        self._vectors: Chroma | None = None
        self.embeddings = EmbeddingGemma(base_url=settings.ollama_base_url, model=settings.embedding_model)
        self._markdown_sections = MarkdownHeaderTextSplitter(MARKDOWN_HEADERS, strip_headers=False)
        self._markdown_splitter = RecursiveCharacterTextSplitter.from_language(
            Language.MARKDOWN, chunk_size=settings.chunk_size, chunk_overlap=settings.chunk_overlap
        )
        self._splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.chunk_size, chunk_overlap=settings.chunk_overlap
        )

    # --- Cycle de synchronisation -------------------------------------------------------------

    def start(self) -> None:
        client = chromadb.PersistentClient(path=settings.chroma_dir, settings=ChromaSettings(anonymized_telemetry=False))
        # Écritures directes dans la collection (pour fournir le titre de section à EmbeddingGemma),
        # recherche sémantique par le vector store LangChain posé sur la même collection
        self._collection = client.get_or_create_collection(_collection_name(), embedding_function=None)
        self._vectors = Chroma(client=client, collection_name=_collection_name(), embedding_function=self.embeddings)
        threading.Thread(target=self._run, name="indexer", daemon=True).start()

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self.sync()
            except Exception:
                logger.exception("Synchronisation de l'index impossible, nouvel essai dans %ss",
                                 settings.sync_interval_seconds)
            self._stop.wait(settings.sync_interval_seconds)

    def sync(self) -> dict[str, list[str]]:
        """Aligne l'index sur le contenu des dossiers. Renvoie les fichiers ajoutés, modifiés, retirés, en échec."""
        with self._lock:
            on_disk = self._scan()
            indexed = self._indexed()
            summary: dict[str, list[str]] = {"added": [], "updated": [], "removed": [], "failed": []}

            for source in sorted(indexed.keys() - on_disk.keys()):
                self._collection.delete(where={"source": source})
                summary["removed"].append(source)
                logger.info("index action=removed source=%s", source)
            for source in set(self._failed) - on_disk.keys():
                self._failed.pop(source)
                self.errors.pop(source, None)

            for source, (path, fingerprint) in sorted(on_disk.items()):
                if indexed.get(source) == fingerprint or self._failed.get(source) == fingerprint:
                    continue
                try:
                    chunks = self._chunks(path, source, fingerprint)
                except Exception as exc:
                    self._failed[source] = fingerprint
                    self.errors[source] = str(exc) if isinstance(exc, UnreadableDocument) else repr(exc)
                    summary["failed"].append(source)
                    logger.warning("index action=failed source=%s error=%r", source, self.errors[source])
                    continue
                # Une erreur ici (Ollama indisponible) remonte : le fichier sera retenté au cycle suivant
                texts = [c.page_content for c in chunks]
                vectors = self.embeddings.embed_titled_documents(texts, [_title(c) for c in chunks])
                if source in indexed:
                    self._collection.delete(where={"source": source})
                self._collection.add(
                    ids=[f"{fingerprint[:16]}-{i}" for i in range(len(chunks))],
                    embeddings=vectors,
                    documents=texts,
                    metadatas=[c.metadata for c in chunks],
                )
                self._failed.pop(source, None)
                self.errors.pop(source, None)
                action = "updated" if source in indexed else "added"
                summary[action].append(source)
                logger.info("index action=%s source=%s chunks=%s", action, source, len(chunks))

            if self._lexical is None or summary["added"] or summary["updated"] or summary["removed"]:
                self._rebuild_lexical()
            return summary

    # --- Recherche ----------------------------------------------------------------------------

    def search(self, query: str, k: int) -> list[Document]:
        """Les k extraits les plus pertinents, par fusion des classements sémantique et lexical."""
        candidates = k * 3
        return fuse([self._vectors.similarity_search(query, k=candidates), self._lexical_search(query, candidates)], k)

    def _lexical_search(self, query: str, k: int) -> list[Document]:
        lexical = self._lexical
        query_tokens = tokens(query)
        if lexical is None or not query_tokens:
            return []
        bm25, documents = lexical
        scores = bm25.get_scores(query_tokens)
        best = sorted(range(len(documents)), key=lambda i: scores[i], reverse=True)[:k]
        return [documents[i] for i in best if scores[i] > 0]

    def _rebuild_lexical(self) -> None:
        data = self._collection.get(include=["documents", "metadatas"])
        documents = [
            Document(text, id=i, metadata=meta)
            for i, text, meta in zip(data["ids"], data["documents"], data["metadatas"])
        ]
        self._lexical = (BM25Okapi([tokens(d.page_content) for d in documents]), documents) if documents else None

    # --- Lecture des dossiers et de l'index ---------------------------------------------------

    def _scan(self) -> dict[str, tuple[Path, str]]:
        found: dict[str, tuple[Path, str]] = {}
        for root in settings.documents_roots:
            if not root.is_dir():
                continue
            for path in sorted(root.rglob("*")):
                relative = path.relative_to(root)
                if not path.is_file() or _ignored(relative) or path.suffix.lower() not in SUPPORTED_EXTENSIONS:
                    continue
                if path.stat().st_size > MAX_FILE_BYTES:
                    logger.warning("index action=skipped source=%s reason=too_large", relative.as_posix())
                    continue
                fingerprint = hashlib.sha256(path.read_bytes() + self._split_signature).hexdigest()
                found[f"{root.name}/{relative.as_posix()}"] = (path, fingerprint)
        return found

    def _indexed(self) -> dict[str, str]:
        metadatas = self._collection.get(include=["metadatas"])["metadatas"]
        return {m["source"]: m["fingerprint"] for m in metadatas if m}

    def stats(self) -> dict:
        metadatas = self._collection.get(include=["metadatas"])["metadatas"]
        counts = Counter(m["source"] for m in metadatas if m)
        return {
            "documents": [{"source": source, "chunks": n} for source, n in sorted(counts.items())],
            "chunks": sum(counts.values()),
            "errors": dict(self.errors),
        }

    # --- Chargement et découpage --------------------------------------------------------------

    def _chunks(self, path: Path, source: str, fingerprint: str) -> list[Document]:
        chunks = self.split(path.name, path.read_bytes())
        for chunk in chunks:
            chunk.metadata.update(source=source, fingerprint=fingerprint)
        return chunks

    def split(self, name: str, data: bytes) -> list[Document]:
        """Extraits d'un fichier, selon son extension (aussi utilisé pour les pièces jointes du chat)."""
        extension = Path(name).suffix.lower()
        if extension == ".pdf":
            pages = [
                Document(page.extract_text() or "", metadata={"page": number})
                for number, page in enumerate(PdfReader(io.BytesIO(data)).pages, start=1)
            ]
            chunks = self._splitter.split_documents(pages)
        elif extension == ".docx":
            chunks = self._splitter.split_documents([Document(docx2txt.process(io.BytesIO(data)) or "")])
        elif extension in MARKDOWN_EXTENSIONS:
            sections = self._markdown_sections.split_text(_decode(data))
            for section in sections:
                titles = [section.metadata[key] for _, key in MARKDOWN_HEADERS if key in section.metadata]
                section.metadata = {"section": " › ".join(titles)} if titles else {}
            chunks = self._markdown_splitter.split_documents(sections)
        else:
            chunks = self._splitter.split_documents([Document(_decode(data))])

        chunks = [c for c in chunks if c.page_content.strip()]
        if not chunks:
            raise UnreadableDocument("aucun texte extrait (PDF scanné ou fichier vide ?)")
        return chunks


indexer = Indexer()
