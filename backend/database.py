import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db():
    """Enable pgvector, create tables, and idempotently add any new columns."""
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()

    # Import here to avoid circular imports at module load time
    import models  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # Idempotently add index columns to existing tables so we don't nuke live data
    new_columns = [
        ("title",      "TEXT"),
        ("summary",    "TEXT"),
        ("keywords",   "JSONB"),
        ("people",     "JSONB"),
        ("locations",  "JSONB"),
        ("timeline",   "JSONB"),
        ("embedding",  "vector(1536)"),
        ("indexed_at", "TIMESTAMPTZ"),
    ]
    with engine.connect() as conn:
        for col, col_type in new_columns:
            conn.execute(text(
                f"ALTER TABLE sources ADD COLUMN IF NOT EXISTS {col} {col_type}"
            ))
        conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
