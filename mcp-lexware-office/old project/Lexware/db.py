"""
db.py
─────
SQLite connection manager and schema initialiser.
Import get_db() wherever you need a database connection.

Usage:
    from db import get_db, init_db
    init_db()                          # call once on startup
    with get_db() as db:
        rows = db.execute("SELECT * FROM contacts").fetchall()
"""

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

DB_PATH = Path("db/lexware.db")
_SCHEMA = Path(__file__).parent / "db" / "schema.sql"


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """
    Yield a sqlite3 connection. Commits on clean exit, rolls back on error.
    Columns are accessible by name (row_factory = sqlite3.Row).
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Create tables from schema.sql if they don't already exist."""
    if not _SCHEMA.exists():
        raise FileNotFoundError(f"Schema not found: {_SCHEMA}")
    sql = _SCHEMA.read_text(encoding="utf-8")
    with get_db() as db:
        db.executescript(sql)
