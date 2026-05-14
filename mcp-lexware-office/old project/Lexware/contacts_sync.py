"""
contacts_sync.py
────────────────
Pulls a fresh copy of all contacts from Lexware and stores them
in the local SQLite database (db/lexware.db).

Called from main.py on every run — always does a full refresh
(DELETE existing rows, then INSERT all current contacts).

Usage:
    from contacts_sync import sync_contacts
    contacts = sync_contacts()
"""

import json
from datetime import datetime, timezone

from lexware_client import LexwareClient
from db import get_db, init_db


def sync_contacts() -> list:
    """
    Full refresh of local contacts table from Lexware.

    Steps:
      1. Ensure DB schema exists
      2. Pull all contacts via paginated GET /v1/contacts
      3. DELETE existing rows, then INSERT all fetched contacts

    Returns the list of raw contact dicts fetched from Lexware.
    """
    init_db()

    client = LexwareClient()
    print("Fetching contacts from Lexware...")
    contacts = client.get_all_contacts()
    print(f"Found {len(contacts)} contact(s). Writing to local database...")

    now = datetime.now(timezone.utc).isoformat()

    with get_db() as db:
        db.execute("DELETE FROM contacts")

        for c in contacts:
            company = c.get("company") or {}
            person  = c.get("person")  or {}
            roles   = c.get("roles")   or {}
            billing = (c.get("addresses", {}).get("billing") or [{}])[0]
            emails  = c.get("emailAddresses", {})
            phones  = c.get("phoneNumbers",   {})

            # Build display name: company name or "First Last"
            if company.get("name"):
                name = company["name"]
            else:
                first = person.get("firstName", "")
                last  = person.get("lastName",  "")
                name  = f"{first} {last}".strip() or "Unknown"

            # First available email across business / office / private
            email = (
                (emails.get("business") or [None])[0] or
                (emails.get("office")   or [None])[0] or
                (emails.get("private")  or [None])[0]
            )

            # First available phone across business / office / mobile
            phone = (
                (phones.get("business") or [None])[0] or
                (phones.get("office")   or [None])[0] or
                (phones.get("mobile")   or [None])[0]
            )

            db.execute("""
                INSERT INTO contacts
                    (id, name, vat_id, tax_number,
                     street, zip, city, country_code,
                     email, phone,
                     role_customer, role_vendor,
                     version, last_synced_at, raw_json)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                c["id"],
                name,
                company.get("vatRegistrationId"),
                company.get("taxNumber"),
                billing.get("street"),
                billing.get("zip"),
                billing.get("city"),
                billing.get("countryCode", "DE"),
                email,
                phone,
                1 if "customer" in roles else 0,
                1 if "vendor"   in roles else 0,
                c.get("version", 0),
                now,
                json.dumps(c, ensure_ascii=False),
            ))

    print(f"Done. {len(contacts)} contacts stored in db/lexware.db.")
    return contacts
