"""
calibrate.py — Audit vouchers: compare Claude's category suggestion vs what's in Lexware.

READ-ONLY — never writes to Lexware. Use this when onboarding a new client to discover
where Claude's general rules disagree with how the business actually classifies expenses.
Outputs a CSV (all vouchers) + draft vendor_rules.md (mismatches only).

Usage:
  python3 calibrate.py                        # audit all vouchers (unchecked + open + overdue)
  python3 calibrate.py --limit 20             # first 20 only (quick test)
  python3 calibrate.py --vendor "Amazon"      # filter to one vendor
  python3 calibrate.py --out my_draft.md      # custom output filename
  python3 calibrate.py --status open          # single status only
"""

import argparse
import csv
import pathlib
import sys
from collections import defaultdict
from datetime import date
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from lexware_client import LexwareClient
from processor import extract_and_classify
from report import fetch_vouchers, _load_categories

CACHE_DIR = pathlib.Path("pdf/calibration_cache")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _download_pdf(client: LexwareClient, voucher_detail: dict) -> Optional[pathlib.Path]:
    """Download PDF to cache dir. Returns path or None if no file attached."""
    vid = voucher_detail["id"]
    cached = CACHE_DIR / f"{vid}.pdf"
    if cached.exists():
        return cached

    file_ids = voucher_detail.get("files", [])
    if not file_ids:
        return None

    try:
        data = client.download_file(file_ids[0])
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(data)
        return cached
    except Exception as e:
        print(f"  [error] Download failed: {e}", flush=True)
        return None


def _fmt_cat(cat_map: dict, cat_id: Optional[str]) -> str:
    if not cat_id:
        return "— (no category)"
    return cat_map.get(cat_id, f"Unknown ({cat_id[:8]}...)")


# ── Main audit ─────────────────────────────────────────────────────────────────

def run_audit(vendor_filter: Optional[str], statuses: list, limit: Optional[int], out_path: str) -> None:
    client  = LexwareClient()
    cat_map = _load_categories()  # {uuid: "Group > Name"}

    # Derive CSV path from out_path (replace .md extension or append .csv)
    base = pathlib.Path(out_path)
    csv_path = base.with_suffix(".csv")

    # ── 1. Fetch vouchers (deduplicated across statuses) ───────────────────────
    vouchers, seen_ids = [], set()
    for status in statuses:
        print(f"Fetching '{status}' vouchers...", flush=True)
        for v in fetch_vouchers(client, status):
            if v["id"] not in seen_ids:
                seen_ids.add(v["id"])
                vouchers.append(v)

    if vendor_filter:
        needle = vendor_filter.lower().replace(" ", "")
        vouchers = [v for v in vouchers
                    if needle in (v.get("contactName") or "").lower().replace(" ", "")]

    if limit:
        vouchers = vouchers[:limit]

    total = len(vouchers)
    print(f"Auditing {total} voucher(s)...\n", flush=True)

    # ── 2. Per-voucher: fetch detail, download PDF, re-classify ───────────────
    results = []  # list of dicts

    for i, v in enumerate(vouchers, 1):
        vid          = v["id"]
        contact_name = v.get("contactName") or "Unknown"
        inv_no       = v.get("voucherNumber") or "—"

        print(f"[{i}/{total}] {contact_name} | {inv_no}", flush=True)

        # Fetch full detail to get current categoryId
        try:
            detail = client.get_voucher(vid)
        except Exception as e:
            print(f"  [error] Could not fetch detail: {e}", flush=True)
            continue

        items         = detail.get("voucherItems", [])
        lexware_cat_id: Optional[str] = items[0].get("categoryId") if items else None
        lexware_cat   = _fmt_cat(cat_map, lexware_cat_id)

        # Download PDF
        pdf_path = _download_pdf(client, detail)
        if not pdf_path:
            print(f"  [skip] No PDF attached", flush=True)
            continue

        # Re-classify with Claude (read-only)
        try:
            inv, claude_cat, tokens = extract_and_classify(pdf_path)
        except Exception as e:
            print(f"  [error] Claude failed: {e}", flush=True)
            continue

        claude_cat_id   = claude_cat.category_id
        claude_cat_name = f"{claude_cat.group_name} > {claude_cat.category_name}"

        match = (claude_cat_id == lexware_cat_id)
        status_mark = "✓ MATCH" if match else "✗ MISMATCH"

        print(f"  Lexware: {lexware_cat}", flush=True)
        print(f"  Claude:  {claude_cat_name}   {status_mark}", flush=True)

        results.append({
            "voucher_id":      vid,
            "contact_name":    contact_name,
            "inv_no":          inv_no,
            "voucher_date":    v.get("voucherDate", "")[:10] if v.get("voucherDate") else "",
            "total_amount":    v.get("totalAmount", ""),
            "status":          v.get("voucherStatus", ""),
            "lexware_cat_id":  lexware_cat_id,
            "lexware_cat":     lexware_cat,
            "claude_cat_id":   claude_cat_id,
            "claude_cat":      claude_cat_name,
            "match":           match,
            "tokens":          tokens,
        })

    # ── 3. Summary ─────────────────────────────────────────────────────────────
    mismatches = [r for r in results if not r["match"]]
    matches    = [r for r in results if r["match"]]

    print(f"\n{'═'*60}", flush=True)
    print(f"Audit complete — {len(matches)} match, {len(mismatches)} mismatch, "
          f"{total - len(results)} skipped", flush=True)

    if not mismatches:
        print("No mismatches found — Claude agrees with all current categories.")
        # Still write CSV even when all match
        csv_headers = [
            "Voucher ID", "Vendor", "Invoice No", "Date", "Amount", "Status",
            "Lexware Category", "Claude Category", "Match",
        ]
        with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f, delimiter=";")
            writer.writerow(csv_headers)
            for r in results:
                writer.writerow([
                    r["voucher_id"], r["contact_name"], r["inv_no"],
                    r["voucher_date"], r["total_amount"], r["status"],
                    r["lexware_cat"], r["claude_cat"], "YES" if r["match"] else "NO",
                ])
        print(f"CSV comparison written to: {csv_path}")
        return

    # Group mismatches by vendor
    by_vendor = defaultdict(list)
    for r in mismatches:
        by_vendor[r["contact_name"]].append(r)

    print(f"\n{'═'*60}")
    print(f"MISMATCHES BY VENDOR ({len(mismatches)} of {len(results)} vouchers audited)")
    print(f"{'═'*60}\n")

    for vendor, rows in sorted(by_vendor.items(), key=lambda x: -len(x[1])):
        # Find most common disagreement pair for this vendor
        pair_counts: dict = defaultdict(int)
        for r in rows:
            pair_counts[(r["lexware_cat"], r["claude_cat"])] += 1
        most_common = max(pair_counts, key=lambda k: pair_counts[k])
        inv_nos = ", ".join(r["inv_no"] for r in rows[:5])
        if len(rows) > 5:
            inv_nos += f" ... (+{len(rows)-5} more)"

        print(f"Vendor: {vendor}  ({len(rows)} mismatch{'es' if len(rows)>1 else ''})")
        print(f"  Lexware says:  {most_common[0]}")
        print(f"  Claude says:   {most_common[1]}")
        print(f"  Invoices:      {inv_nos}")
        print()

    # ── 4. Write draft vendor_rules.md ─────────────────────────────────────────
    today = date.today().isoformat()
    lines = [
        f"# DRAFT vendor_rules.md — generated by calibrate.py on {today}",
        "# Review each entry with the client before adding to vendor_rules.md.",
        "# DELETE entries that are correct (no rule needed).",
        "# KEEP and EDIT entries where Claude is wrong.",
        "",
    ]

    for vendor, rows in sorted(by_vendor.items(), key=lambda x: -len(x[1])):
        pair_counts: dict = defaultdict(int)
        for r in rows:
            pair_counts[(r["lexware_cat"], r["claude_cat"])] += 1
        most_common = max(pair_counts, key=lambda k: pair_counts[k])
        lexware_cat, claude_cat = most_common

        lines += [
            f"# ── {vendor} ({len(rows)} invoice{'s' if len(rows)>1 else ''}) ────────────────────",
            f"# Lexware has it as:  {lexware_cat}",
            f"# Claude suggests:    {claude_cat}",
            f"# → Ask client: which is correct? Delete this block if Claude is right.",
            f"#   If Lexware is right, edit and uncomment the rule below:",
            f"#",
            f"# {vendor}: [describe what you buy from them and why]",
            f"#   → Always classify as {lexware_cat.split(' > ')[-1] if ' > ' in lexware_cat else lexware_cat}",
            f"",
        ]

    draft_path = pathlib.Path(out_path)
    draft_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Draft vendor rules written to: {draft_path}")
    print("Review with client → copy relevant lines into vendor_rules.md → re-run main.py")

    # ── 5. Write CSV (all audited vouchers) ────────────────────────────────────
    csv_headers = [
        "Voucher ID",
        "Vendor",
        "Invoice No",
        "Date",
        "Amount",
        "Status",
        "Lexware Category",
        "Claude Category",
        "Match",
    ]
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(csv_headers)
        for r in results:
            writer.writerow([
                r["voucher_id"],
                r["contact_name"],
                r["inv_no"],
                r["voucher_date"],
                r["total_amount"],
                r["status"],
                r["lexware_cat"],
                r["claude_cat"],
                "YES" if r["match"] else "NO",
            ])
    print(f"CSV comparison written to:      {csv_path}")


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Audit open vouchers: compare Claude classification vs Lexware (read-only)"
    )
    parser.add_argument("--vendor", default=None,
                        help="Filter to vendor name (partial match)")
    parser.add_argument("--status", default=None,
                        help="Voucher status to audit (default: open + overdue). E.g. --status paid")
    parser.add_argument("--limit", type=int, default=None,
                        help="Max vouchers to audit (default: all)")
    parser.add_argument("--out", default="calibration_rules_draft.md",
                        help="Output draft filename (default: calibration_rules_draft.md)")
    args = parser.parse_args()

    statuses = [args.status] if args.status else ["unchecked", "open", "overdue"]
    run_audit(
        vendor_filter=args.vendor,
        statuses=statuses,
        limit=args.limit,
        out_path=args.out,
    )


if __name__ == "__main__":
    main()
