"""
report.py — Print all open Lexware vouchers in a tabular format.

Usage:
  python3 report.py                    # all open vouchers
  python3 report.py --status overdue   # filter by status (open/overdue/draft)
  python3 report.py --csv              # also save to open_vouchers.csv
"""

import argparse
import csv
import sqlite3
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(Path(__file__).parent))
from lexware_client import LexwareClient


# ── Category lookup from local DB ─────────────────────────────────────────────

def _load_categories() -> dict:
    """Return {category_id: 'Group > Name'} from local SQLite cache."""
    db_path = Path("db/lexware.db")
    if not db_path.exists():
        return {}
    conn = sqlite3.connect(db_path)
    rows = conn.execute("SELECT id, group_name, name FROM posting_categories").fetchall()
    conn.close()
    return {r[0]: f"{r[1]} > {r[2]}" for r in rows}


# ── Fetch vouchers ─────────────────────────────────────────────────────────────

def fetch_vouchers(client: LexwareClient, status: str) -> list[dict]:
    """Fetch all vouchers with the given status (paginated)."""
    vouchers, page = [], 0
    while True:
        resp = client.get("voucherlist", params={
            "voucherType":   "any",
            "voucherStatus": status,
            "page": page,
            "size": 100,
        })
        content = resp.get("content", [])
        vouchers.extend(content)
        if resp.get("last", True) or not content:
            break
        page += 1
    return vouchers


def enrich_with_category(client: LexwareClient, vouchers: list[dict], cat_map: dict) -> list[dict]:
    """Fetch full detail for each voucher and attach category name."""
    total = len(vouchers)
    for i, v in enumerate(vouchers, 1):
        print(f"\r  Fetching details [{i}/{total}]...", end="", flush=True)
        try:
            detail = client.get_voucher(v["id"])
            items = detail.get("voucherItems", [])
            cat_id = items[0].get("categoryId") if items else None
            v["_category"] = cat_map.get(cat_id, cat_id or "—")
            v["_taxType"]  = detail.get("taxType", "")
            rates = sorted({item.get("taxRatePercent") for item in items
                            if item.get("taxRatePercent") is not None})
            v["_tax_rates"] = " / ".join(f'{r:g}%' for r in rates) if rates else "0%"
        except Exception:
            v["_category"]  = "—"
            v["_taxType"]   = ""
            v["_tax_rates"] = "—"
    print()  # newline after progress
    return vouchers


# ── Formatting ─────────────────────────────────────────────────────────────────

def _fmt_date(iso: str) -> str:
    if not iso:
        return "—"
    return iso[:10]  # YYYY-MM-DD


def _fmt_amount(amt) -> str:
    if amt is None:
        return "—"
    return f"{amt:,.2f}"


def print_table(rows: list[dict]) -> None:
    """Print rows as a fixed-width terminal table."""
    COL_W = {
        "#":          4,
        "Vendor":     35,
        "Invoice No": 22,
        "Date":       12,
        "Gross (€)":  12,
        "Tax":        8,
        "Status":     9,
        "Category":   45,
    }
    headers = list(COL_W.keys())
    sep = "─" * (sum(COL_W.values()) + 3 * (len(headers) - 1))

    def row_str(cells):
        return "  ".join(str(c).ljust(COL_W[h]) if h != "Gross (€)" else str(c).rjust(COL_W[h])
                         for h, c in zip(headers, cells))

    print()
    print(row_str(headers))
    print(sep)

    total_gross = 0.0
    for i, v in enumerate(rows, 1):
        gross = v.get("totalAmount") or 0.0
        total_gross += gross
        cells = [
            i,
            (v.get("contactName") or "—")[:COL_W["Vendor"]],
            (v.get("voucherNumber") or "—")[:COL_W["Invoice No"]],
            _fmt_date(v.get("voucherDate")),
            _fmt_amount(gross),
            v.get("_tax_rates", "—"),
            v.get("voucherStatus", "—"),
            (v.get("_category") or "—")[:COL_W["Category"]],
        ]
        print(row_str(cells))

    print(sep)
    summary_cells = [
        f"{len(rows)} vouchers",
        "",
        "",
        "TOTAL",
        _fmt_amount(total_gross),
        "",
        "",
    ]
    print(row_str(summary_cells))
    print()


def save_csv(rows: list[dict], path: str = "open_vouchers.csv") -> None:
    fields = ["#", "id", "contactName", "voucherNumber", "voucherDate",
              "totalAmount", "_tax_rates", "voucherStatus", "_category"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for i, v in enumerate(rows, 1):
            w.writerow({"#": i, **v})
    print(f"  Saved {len(rows)} rows → {path}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="List Lexware vouchers in a table")
    parser.add_argument("--status", default="open",
                        help="Voucher status to filter (default: open)")
    parser.add_argument("--csv", action="store_true",
                        help="Also export to open_vouchers.csv")
    args = parser.parse_args()

    client  = LexwareClient()
    cat_map = _load_categories()

    print(f"Fetching '{args.status}' vouchers...", flush=True)
    vouchers = fetch_vouchers(client, args.status)
    print(f"Found {len(vouchers)} voucher(s). Fetching categories...", flush=True)

    vouchers = enrich_with_category(client, vouchers, cat_map)

    # Sort by date descending
    vouchers.sort(key=lambda v: v.get("voucherDate") or "", reverse=True)

    print_table(vouchers)

    if args.csv:
        save_csv(vouchers)


if __name__ == "__main__":
    main()
