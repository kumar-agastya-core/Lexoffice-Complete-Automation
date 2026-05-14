"""
bank_export.py — Export open vouchers for a specific vendor as a German bank-statement CSV.

Usage:
  python3 bank_export.py "Amazon Online Germany GmbH"
  python3 bank_export.py "Amazon Online Germany" --status overdue
  python3 bank_export.py "Amazon Online Germany" --out my_export.csv

Output format (semicolon-separated, German locale, UTF-8 BOM for Excel):
  Buchungstag;Valuta;Auftraggeber/Zahlungsempfänger;Empfänger/Zahlungspflichtiger;Vorgang/Verwendungszweck;Betrag;Zusatzinfo (optional)

# Export all open Amazon Online Germany vouchers
python3 bank_export.py "Amazon Online Germany GmbH"

# Custom output filename
python3 bank_export.py "Amazon Online Germany GmbH" --out amazon_jan2026.csv

# Include overdue as well
python3 bank_export.py "Amazon Online Germany GmbH" --status overdue

# Any other vendor — partial name match works
python3 bank_export.py "DHL"
python3 bank_export.py "eBay"
"""

import argparse
import csv
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(Path(__file__).parent))
from lexware_client import LexwareClient
from report import fetch_vouchers

OWN_NAME = os.environ.get("OWN_NAME", "Account Holder").strip()


def _fmt_date(iso: str) -> str:
    """Convert ISO date string to DD.MM.YYYY."""
    if not iso or len(iso) < 10:
        return ""
    y, m, d = iso[:10].split("-")
    return f"{d}.{m}.{y}"


def _fmt_amount(amount) -> str:
    """Format amount as German decimal: 490,90"""
    if amount is None:
        return ""
    return f"{amount:.2f}".replace(".", ",")


def export(vendor_filter: str, statuses: list, out_path: str) -> None:
    client = LexwareClient()

    all_vouchers = []
    seen_ids = set()
    for status in statuses:
        print(f"Fetching '{status}' vouchers...", flush=True)
        for v in fetch_vouchers(client, status):
            if v["id"] not in seen_ids:
                seen_ids.add(v["id"])
                all_vouchers.append(v)

    # Filter by vendor name (case-insensitive partial match)
    matched = [
        v for v in all_vouchers
        if vendor_filter.lower().replace(" ", "") in (v.get("contactName") or "").lower().replace(" ", "")
    ]

    if not matched:
        print(f"No vouchers found for vendor matching '{vendor_filter}'.")
        return

    # Sort oldest first (bank statement order)
    matched.sort(key=lambda v: v.get("voucherDate") or "")

    print(f"Found {len(matched)} voucher(s) for '{vendor_filter}'. Writing to {out_path}...", flush=True)

    headers = [
        "Buchungstag",
        "Valuta",
        "Auftraggeber/Zahlungsempfänger",
        "Empfänger/Zahlungspflichtiger",
        "Vorgang/Verwendungszweck",
        "Betrag",
        "Zusatzinfo (optional)",
    ]

    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(headers)
        for v in matched:
            date      = _fmt_date(v.get("voucherDate") or "")
            vendor    = v.get("contactName") or ""
            inv_no    = v.get("voucherNumber") or ""
            amount    = _fmt_amount(v.get("totalAmount"))
            vorgang   = f"Rechnung {inv_no} {vendor}".strip()

            writer.writerow([
                date,          # Buchungstag
                date,          # Valuta (same as booking date)
                vendor,        # Auftraggeber/Zahlungsempfänger
                OWN_NAME,      # Empfänger/Zahlungspflichtiger
                vorgang,       # Vorgang/Verwendungszweck
                amount,        # Betrag
                "",            # Zusatzinfo (optional)
            ])

    print(f"Done — {len(matched)} row(s) written to {out_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Export open Lexware vouchers for a vendor as a bank-statement CSV"
    )
    parser.add_argument("vendor", help="Vendor name to filter (partial match, case-insensitive)")
    parser.add_argument("--status", default=None,
                        help="Voucher status to fetch (default: open + overdue). Use 'paid' for paid only.")
    parser.add_argument("--out", default=None, help="Output CSV filename (default: auto-generated)")
    args = parser.parse_args()

    statuses = [args.status] if args.status else ["open", "overdue"]
    out_path = args.out or f"{args.vendor.replace(' ', '_').replace('/', '_')}.csv"
    export(args.vendor, statuses, out_path)


if __name__ == "__main__":
    main()
