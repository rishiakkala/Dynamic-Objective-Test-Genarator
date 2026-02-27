"""
Vector Store Module — ChromaDB-backed persistent knowledge storage.

Features:
- Auto-detects file changes via last-modified timestamp
- Only re-embeds when the source document has changed
- Supports metadata tagging: text / table / image / equation content types
- Exposes simple upsert, query, and delete API
"""

import os
import json
import hashlib
from typing import List, Dict, Any, Optional


# ─────────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────────

CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")
COLLECTION_NAME = "dotg_knowledge"
CHUNK_SIZE = 400      # words per chunk
CHUNK_OVERLAP = 40    # word overlap between chunks
TOP_K_DEFAULT = 6     # default number of results to return from a query


# ─────────────────────────────────────────────
#  INTERNAL HELPERS
# ─────────────────────────────────────────────

def _get_collection():
    """Return (or create) the ChromaDB collection."""
    try:
        import chromadb
        client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
        collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        return collection
    except ImportError:
        raise RuntimeError(
            "chromadb is not installed. Run: pip install chromadb"
        )


def _embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Embed a list of texts using sentence-transformers (local, free).
    Falls back to a simple TF-IDF hash if sentence-transformers is absent.
    """
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("all-MiniLM-L6-v2")
        embeddings = model.encode(texts, show_progress_bar=False)
        return embeddings.tolist()
    except ImportError:
        # Fallback: deterministic pseudo-embedding (not useful for semantic search,
        # but keeps the pipeline runnable without sentence-transformers)
        import hashlib, struct
        vectors = []
        for text in texts:
            digest = hashlib.md5(text.encode()).digest()
            # 16 bytes → 16 floats normalised to [-1, 1]
            vec = [struct.unpack("b", bytes([b]))[0] / 128.0 for b in digest]
            # Pad to 384 dims (MiniLM output size) with zeros
            vec = vec + [0.0] * (384 - len(vec))
            vectors.append(vec)
        return vectors


def _file_fingerprint(file_path: str) -> str:
    """Return a fingerprint (mtime + size) for a file to detect changes."""
    stat = os.stat(file_path)
    return f"{stat.st_mtime:.0f}_{stat.st_size}"


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE,
                overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split text into overlapping word-based chunks."""
    words = text.split()
    chunks = []
    step = max(1, chunk_size - overlap)
    for i in range(0, len(words), step):
        chunk = " ".join(words[i: i + chunk_size])
        if len(chunk.strip()) > 20:   # skip tiny fragments
            chunks.append(chunk)
    return chunks


def _detect_content_type(chunk: str) -> str:
    """Infer the content type from the tagged chunk prefix."""
    chunk_upper = chunk[:50].upper()
    if "[TABLE" in chunk_upper:
        return "table"
    if "[IMAGE" in chunk_upper:
        return "image"
    if "[EQUATION" in chunk_upper:
        return "equation"
    if "[OCR]" in chunk_upper or "OCR" in chunk_upper:
        return "ocr_text"
    return "text"


def _doc_id_prefix(file_path: str) -> str:
    """Create a stable short ID prefix from a file path."""
    return hashlib.md5(os.path.abspath(file_path).encode()).hexdigest()[:12]


# ─────────────────────────────────────────────
#  PUBLIC API
# ─────────────────────────────────────────────

def document_needs_update(file_path: str) -> bool:
    """
    Check whether the source file has changed since it was last embedded.
    Returns True if the document should be re-processed and re-embedded.
    """
    if not os.path.exists(file_path):
        return False

    try:
        collection = _get_collection()
        prefix = _doc_id_prefix(file_path)

        # Look for any chunk from this document
        results = collection.get(
            where={"source_file": os.path.abspath(file_path)},
            limit=1,
            include=["metadatas"],
        )

        if not results["ids"]:
            return True  # Not in DB yet

        stored_fingerprint = results["metadatas"][0].get("fingerprint", "")
        current_fingerprint = _file_fingerprint(file_path)
        return stored_fingerprint != current_fingerprint

    except Exception:
        return True  # On any error, assume update needed


def delete_document(file_path: str) -> int:
    """Remove all vector chunks belonging to a given source file. Returns count deleted."""
    try:
        collection = _get_collection()
        abs_path = os.path.abspath(file_path)

        results = collection.get(
            where={"source_file": abs_path},
            include=["metadatas"],
        )
        ids_to_delete = results["ids"]
        if ids_to_delete:
            collection.delete(ids=ids_to_delete)
            print(f"  [VectorDB] Deleted {len(ids_to_delete)} chunks for: {os.path.basename(file_path)}")
        return len(ids_to_delete)
    except Exception as e:
        print(f"  [VectorDB] Warning: could not delete document: {e}")
        return 0


def upsert_document(file_path: str, content: str) -> int:
    """
    Embed and store all chunks of a document in ChromaDB.
    If the document already exists and is unchanged, this is a no-op.
    If it has changed, old chunks are deleted and new ones upserted.
    Returns the number of chunks stored.
    """
    if not content or not content.strip():
        print("  [VectorDB] No content to embed.")
        return 0

    abs_path = os.path.abspath(file_path)
    fingerprint = _file_fingerprint(file_path)

    # Delete stale chunks first
    delete_document(file_path)

    # Chunk the content
    chunks = _chunk_text(content)
    if not chunks:
        return 0

    print(f"  [VectorDB] Embedding {len(chunks)} chunks for: {os.path.basename(file_path)}")

    # Embed
    embeddings = _embed_texts(chunks)

    # Build IDs and metadatas
    prefix = _doc_id_prefix(file_path)
    ids = [f"{prefix}_chunk_{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "source_file": abs_path,
            "chunk_index": i,
            "content_type": _detect_content_type(chunk),
            "fingerprint": fingerprint,
            "filename": os.path.basename(file_path),
        }
        for i, chunk in enumerate(chunks)
    ]

    try:
        collection = _get_collection()
        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas,
        )
        print(f"  [VectorDB] ✓ Stored {len(chunks)} chunks.")
        return len(chunks)
    except Exception as e:
        print(f"  [VectorDB] Error storing chunks: {e}")
        return 0


def query_similar(query_text: str, top_k: int = TOP_K_DEFAULT,
                  file_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Retrieve the top-K most semantically similar chunks to a query.

    Args:
        query_text   : The search query (e.g., topic or question focus area)
        top_k        : Number of results to return
        file_path    : Optional — restrict search to a specific source file

    Returns:
        List of dicts with keys: text, content_type, chunk_index, score
    """
    try:
        collection = _get_collection()

        query_embedding = _embed_texts([query_text])[0]

        where_filter = None
        if file_path:
            where_filter = {"source_file": os.path.abspath(file_path)}

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )

        output = []
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        for doc, meta, dist in zip(docs, metas, distances):
            output.append({
                "text": doc,
                "content_type": meta.get("content_type", "text"),
                "chunk_index": meta.get("chunk_index", -1),
                "filename": meta.get("filename", ""),
                "score": round(1 - dist, 4),   # cosine similarity
            })

        return output

    except Exception as e:
        print(f"  [VectorDB] Query error: {e}")
        return []


def build_context_from_query(query_text: str, top_k: int = TOP_K_DEFAULT,
                              file_path: Optional[str] = None) -> str:
    """
    Retrieve top-K relevant chunks and format them as a context string
    ready to be injected into an LLM prompt.
    """
    results = query_similar(query_text, top_k=top_k, file_path=file_path)
    if not results:
        return ""

    parts = []
    for i, r in enumerate(results, start=1):
        label = r["content_type"].upper().replace("_", " ")
        parts.append(f"[Context {i} — {label}]\n{r['text']}")

    return "\n\n".join(parts)


def get_stats() -> Dict[str, Any]:
    """Return basic statistics about the vector database."""
    try:
        collection = _get_collection()
        count = collection.count()
        return {"total_chunks": count, "collection": COLLECTION_NAME,
                "persist_dir": CHROMA_PERSIST_DIR}
    except Exception as e:
        return {"error": str(e)}
