"""
categories_sync.py
──────────────────
Pulls a fresh copy of all posting categories from Lexware and stores
them in the local SQLite database (db/lexware.db).

Called from main.py on every run — always does a full refresh
(DELETE existing rows, then INSERT all current categories).

Usage:
    from categories_sync import sync_categories
    categories = sync_categories()
"""

from datetime import datetime, timezone

from lexware_client import LexwareClient
from db import get_db, init_db


def sync_categories() -> list:
    """
    Full refresh of local posting_categories table from Lexware.

    Steps:
      1. Ensure DB schema exists
      2. Pull all categories via GET /v1/posting-categories
      3. DELETE existing rows, then INSERT all fetched categories

    Returns the list of raw category dicts fetched from Lexware.
    """
    init_db()

    client = LexwareClient()
    print("Fetching posting categories from Lexware...")
    categories = client.get_posting_categories()
    print(f"Found {len(categories)} categorie(s). Writing to local database...")

    now = datetime.now(timezone.utc).isoformat()

    with get_db() as db:
        db.execute("DELETE FROM posting_categories")

        for cat in categories:
            db.execute("""
                INSERT INTO posting_categories
                    (id, name, type, split_allowed, group_name, contact_required, last_synced_at)
                VALUES (?,?,?,?,?,?,?)
            """, (
                cat["id"],
                cat["name"],
                cat["type"],
                1 if cat.get("splitAllowed")    else 0,
                cat.get("groupName"),
                1 if cat.get("contactRequired") else 0,
                now,
            ))

    print(f"Done. {len(categories)} posting categories stored in db/lexware.db.")
    return categories
