"""Hybrid source search: semantic (pgvector) + text (pg_trgm)."""

from sqlalchemy import text

# Text match weighted 60%, semantic 40%.
# Verbatim quotes dominate; topic queries still work via semantic.
HYBRID_SQL = text("""
    SELECT *,
        1 - (embedding <=> CAST(:embedding AS vector)) AS semantic_score,
        word_similarity(:query, transcription) AS text_score,
        (1 - (embedding <=> CAST(:embedding AS vector))) * 0.4
          + word_similarity(:query, transcription) * 0.6 AS combined_score
    FROM sources
    WHERE embedding IS NOT NULL AND transcription IS NOT NULL
    ORDER BY combined_score DESC
    LIMIT :limit
""")

HYBRID_SQL_ALL = text("""
    SELECT *,
        1 - (embedding <=> CAST(:embedding AS vector)) AS semantic_score,
        word_similarity(:query, transcription) AS text_score,
        (1 - (embedding <=> CAST(:embedding AS vector))) * 0.4
          + word_similarity(:query, transcription) * 0.6 AS combined_score
    FROM sources
    WHERE embedding IS NOT NULL AND transcription IS NOT NULL
    ORDER BY combined_score DESC
""")


def hybrid_search(db, query_text: str, embedding_str: str, limit: int | None = None):
    """Run a hybrid search and return rows sorted by combined score.

    Args:
        db: SQLAlchemy Session
        query_text: raw text query (used for pg_trgm word_similarity)
        embedding_str: pre-formatted embedding string "[0.1,0.2,...]"
        limit: max rows to return; None = all indexed sources
    """
    params: dict = {"query": query_text, "embedding": embedding_str}
    if limit is not None:
        params["limit"] = limit
        return db.execute(HYBRID_SQL, params).fetchall()
    return db.execute(HYBRID_SQL_ALL, params).fetchall()
