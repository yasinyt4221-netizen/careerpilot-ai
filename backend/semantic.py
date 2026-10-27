"""CPU embeddings. Model files are downloaded only by prepare_semantic_model.py."""
import os
from functools import lru_cache
from pathlib import Path
from threading import Lock
from typing import Protocol

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_CACHE = Path(os.getenv("CAREERPILOT_MODEL_CACHE", str(Path(__file__).parent / ".models")))


class SemanticUnavailable(Exception):
    pass


class EmbeddingProvider(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class LocalEmbeddingProvider:
    def __init__(self):
        from fastembed import TextEmbedding
        try:
            self.model = TextEmbedding(
                model_name=MODEL_NAME, cache_dir=str(MODEL_CACHE),
                threads=2, providers=["CPUExecutionProvider"], local_files_only=True,
            )
        except Exception:
            raise SemanticUnavailable("The local embedding model is unavailable.") from None
        self.lock = Lock()

    def embed(self, texts: list[str]) -> list[list[float]]:
        try:
            with self.lock:
                return [vector.tolist() for vector in self.model.embed(texts, batch_size=32)]
        except Exception:
            # Never log model exceptions which could contain user-provided text.
            raise SemanticUnavailable("Local semantic comparison could not complete.") from None


@lru_cache(maxsize=1)
def get_semantic_provider() -> EmbeddingProvider:
    if os.getenv("SEMANTIC_ENABLED", "true").lower() in {"0", "false", "off"}:
        raise SemanticUnavailable("Semantic comparison is disabled.")
    return LocalEmbeddingProvider()
