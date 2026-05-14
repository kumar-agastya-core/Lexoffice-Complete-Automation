#!/usr/bin/env python3
"""
processor.py
────────────
Processes Zu Prüfung PDF vouchers from pdf/inbox/ and updates them in Lexware.

Each file in pdf/inbox/ is named {voucher_uuid}.pdf — downloaded by downloader.py.
The voucher already exists in Lexware as unchecked. This script fills in the
bookkeeping data and promotes it to open.

Flow (per PDF):
  1. Send the PDF binary directly to Claude — one combined call that extracts
     all invoice data AND selects the best posting category from the 231 synced
     categories.
  2. Look up the vendor contact in the local DB (VAT ID → IBAN → fuzzy name).
  3. If contact NOT found → skip. Leave the voucher unchecked in Lexware.
     The user must create the contact manually; the PDF stays in inbox and
     will be retried on the next main.py run.
  4. Math check: verify that extracted line items sum to the invoice totals.
  5. Tax type guard: only gross / net / vatfree are valid for the vouchers
     endpoint. §13b categories handle reverse charge automatically.
  6. Credit note detection: negative total_gross → purchasecreditnote type,
     all amounts flipped to positive.
  7. Build a PUT payload with Spaltenmethode tax calculation (Lexware standard).
     Optimistic locking: current version is fetched before every PUT.
  8. PUT the voucher (unchecked → open). Existing PDF attachment is preserved.
  9. Move PDF to pdf/processed/ (success) or pdf/failed/ (error).

Entry point: run_batch() — called from main.py
"""

import base64
import json
import os
import re
import shutil
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import anthropic
import requests
from dotenv import load_dotenv

from db import get_db
from lexware_client import LexwareClient

load_dotenv()

# ── Paths ─────────────────────────────────────────────────────────────────────
PDF_INBOX     = Path("pdf/inbox")
PDF_PROCESSED = Path("pdf/processed")
PDF_FAILED    = Path("pdf/failed")

# ── Constants ─────────────────────────────────────────────────────────────────
# Zu prüfen fallback category for outgo vouchers (from local posting_categories)
ZU_PRUEFEN_OUTGO_ID = "8d2e71c6-09d5-439a-a295-a9e71661afcd"

# Only these taxType values are accepted by the vouchers endpoint
_VALID_TAX_TYPES = {"gross", "net", "vatfree"}

# UUID pattern — voucher filenames are always UUIDs
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

# ── Company identifiers (from .env) ───────────────────────────────────────────
_OWN_VAT   = os.environ.get("OWN_VAT_ID", "").strip()
_OWN_IBANS = {
    i.strip().upper().replace(" ", "")
    for i in os.environ.get("OWN_IBANS", "").split(",")
    if i.strip()
}

# ── Claude client ─────────────────────────────────────────────────────────────
_claude = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

# ── Claude rate limiting ──────────────────────────────────────────────────────
_CLAUDE_MIN_GAP = 15.0   # minimum seconds between Claude API calls
_last_claude_t  = 0.0


def _throttle_claude() -> None:
    global _last_claude_t
    elapsed = time.time() - _last_claude_t
    if elapsed < _CLAUDE_MIN_GAP:
        time.sleep(_CLAUDE_MIN_GAP - elapsed)
    _last_claude_t = time.time()


def _claude_call(**kwargs):
    """Call Claude with rate-limit throttle and exponential backoff on 429."""
    _throttle_claude()
    wait = 60.0
    for attempt in range(4):
        try:
            return _claude.messages.create(**kwargs)
        except anthropic.RateLimitError:
            if attempt >= 3:
                raise
            print(f"  [Claude 429] waiting {wait:.0f}s before retry {attempt + 1}/3...")
            time.sleep(wait)
            wait *= 1.5
            _last_claude_t = time.time()
        except (anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
            if attempt >= 3:
                raise
            print(f"  [Claude error {type(e).__name__}] waiting {wait:.0f}s before retry {attempt + 1}/3...")
            time.sleep(wait)
            wait *= 1.5
    raise RuntimeError("Claude retry loop exhausted")


# ─────────────────────────────────────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class TaxItem:
    rate:  float
    net:   float
    tax:   float
    gross: float


@dataclass
class InvoiceData:
    vendor_name:         Optional[str]
    iban:                Optional[str]
    vat_id:              Optional[str]
    tax_number:          Optional[str]
    invoice_number:      Optional[str]
    invoice_date:        Optional[str]
    due_date:            Optional[str]
    total_gross:         Optional[float]
    total_tax:           Optional[float]
    tax_items:           list = field(default_factory=list)
    tax_type:            str  = "gross"
    category_suggestion: Optional[str] = None


@dataclass
class CategoryResult:
    category_id:   str
    category_name: str
    group_name:    str
    method:        str   # "claude" | "fallback"


# ─────────────────────────────────────────────────────────────────────────────
# Claude prompts
# ─────────────────────────────────────────────────────────────────────────────

_SYSTEM = (
    "You are a German bookkeeping assistant and tax expert for Lexware.\n"
    "Given a PDF invoice and a list of expense categories, extract all invoice data "
    "AND select the single best posting category UUID.\n"
    "Return ONLY valid JSON — no markdown, no explanation, no prose.\n"
    f"Never return VAT ID {_OWN_VAT or 'our company VAT'} as the vendor — "
    "that is our own VAT ID. Find the actual issuer instead.\n"
    "Dates must be YYYY-MM-DD. All amounts must be numeric floats."
)

# {own_vat}, {categories}, {category_rules} filled in at runtime
_PROMPT_TEMPLATE = """\
Extract all invoice data from the attached PDF AND pick the best expense category.
Return a single JSON object:

{{
  "vendor_name": "Full legal company name of the invoice issuer (NOT the recipient)",
  "iban": "Vendor IBAN or null",
  "vat_id": "Vendor VAT ID — NOT {own_vat} — or null",
  "tax_number": "Steuernummer or null",
  "invoice_number": "Invoice/receipt number. For retail receipts (Kassenbon) with no formal invoice number, use the barcode number or Kassenbon-Nummer printed on the receipt. Only null if truly no number exists anywhere.",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "total_gross": 0.00,
  "total_tax": 0.00,
  "tax_items": [{{"rate": 19.0, "net": 0.00, "tax": 0.00, "gross": 0.00}}],
  "tax_type": "gross",
  "category_suggestion": "One-line description of what this invoice is for",
  "category_id": "UUID of the single best matching category from the list below",
  "category_name": "Name of that category",
  "category_group": "Group name of that category"
}}

tax_type: gross (VAT included) | net (VAT on top) | vatfree (§4 UStG / Kleinunternehmer)
tax_items: one entry per tax rate. If all items at same rate → one entry. Multiple rates → one per rate.
If no tax_items can be extracted but you have total_gross and total_tax, infer one tax_item.

{category_rules}

AVAILABLE CATEGORIES (group > name = UUID):
{categories}

Extract from the attached PDF and return the JSON object above.
{vendor_rules}"""

_CATEGORY_RULES = """\
═══ CRITICAL — §13b ELIGIBILITY (check this FIRST, before anything else) ═══
§13b reverse charge ONLY applies when ALL THREE conditions are true:
  1. Vendor is NOT established in Germany (non-DE VAT ID or no DE address)
  2. The vendor did NOT charge VAT on the invoice (total_tax = 0, no VAT line shown)
  3. The service is received in Germany by a German business
If the invoice shows actual VAT charged (VAT line > 0, e.g. "VAT 19% = 96,16 EUR"), it is
DOMESTIC or EU-with-local-VAT → use normal category WITHOUT §13b suffix.

ENTITY vs BRAND: Always classify by the specific legal entity on the invoice, NOT the brand.
  Amazon Online Germany GmbH (DE VAT ID, DE address) → German domestic → no §13b
  Amazon EU S.à r.l. (LU VAT ID) → EU service → §13b EU (only if no VAT charged)
  Amazon Web Services EMEA SARL (LU VAT ID) → EU → §13b EU
  Amazon.com Inc / AWS Inc (US) → Drittland → §13b Drittland

═══ DETECT VENDOR COUNTRY (required for §13b rules) ═══
Check VAT ID prefix: DE=Germany(domestic). EU prefixes=AT BE BG CY CZ DK EE FI FR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK.
All others (US GB AU CH CA JP IN SG NZ etc.)=Drittland.
No VAT ID? Use vendor address country. Unknown? Use brand knowledge (AWS=US=Drittland, GitHub=US=Drittland).

═══ REVERSE CHARGE §13b — CHECK FIRST ═══
Always use dedicated §13b category for foreign services. tax_type="gross" for ALL §13b invoices.
EU vendor providing SERVICES (no VAT on invoice):
  SaaS/licenses (GitHub, Atlassian, JetBrains) → Lizenzen und Konzessionen §13b
  Advertising (Google Ads EU, Meta EU) → Werbung §13b
  Consulting/legal → Beratung §13b | Training → Fortbildung §13b | Other → Fremdleistungen §13b
Drittland vendor providing SERVICES (US, UK, AU, CH, CA etc.):
  SaaS/licenses (AWS, Canva, Adobe, Notion, Zoom, OpenAI, Stripe) → Lizenzen und Konzessionen §13b Drittland
  Advertising → Werbung §13b Drittland | Consulting → Beratung §13b Drittland
  Training → Fortbildung §13b Drittland | Other → Fremdleistungen §13b Drittland
German construction subcontractor → Fremdleistungen > Bauleistungen §13b
EU/Drittland physical goods (shipped) → normal category, tax_type="gross"

═══ INSURANCE (always vatfree) ═══
Insurance premiums (liability, property, health, vehicle, D&O, cyber, legal) → Versicherungen (betrieblich). tax_type="vatfree"

═══ VEHICLE ═══
Leasing/financing → Fahrzeug > Mietleasing Kfz (NEVER Raumkosten > Miete)
Fuel, EV charging, car wash → Fahrzeug > Kraftstoff/Ladestrom
Vehicle insurance → Fahrzeug > Kfz-Versicherung. tax_type="vatfree"
Repair, maintenance, TÜV → Fahrzeug > Kfz-Reparaturen
Parking, tolls → Fahrzeug > Sonstige Kfz-Kosten
Vehicle tax → Fahrzeug > Kfz-Steuer. tax_type="vatfree"

═══ TRAVEL ═══
Hotel/accommodation → Reisen > Übernachtung (room 7%, breakfast 19% — separate tax_items)
Flights, trains, public transport → Reisen > Fahrtkosten
Taxi/rideshare → Reisen > Fahrtkosten (taxi=7% in Germany)
Business meals with EXTERNAL partners → Bewirtungskosten (NOT team meals)

═══ ASSETS & EQUIPMENT ═══
Single item net > €800 (laptop, server, furniture) → Anlagevermögen
Single item net €250-800 → GWG (appropriate category)
Physical hardware (monitors, keyboards, cables, printers, headsets) → Büroausstattung or Bürobedarf (NEVER Fremdleistungen)

═══ SHIPPING ═══
Packaging bulk (500+ units) → Verpackungsmaterial / Versandkosten
Packaging small qty (office use) → Bürobedarf
Postage, DHL/UPS/FedEx → Porto / Versandkosten

═══ SOFTWARE (domestic DE vendors only — use §13b rules above for foreign!) ═══
SaaS/cloud from DE vendor → Lizenzen und Konzessionen
Software maintenance → Wartungskosten für Hard- und Software
Domain, SSL certificates → Lizenzen und Konzessionen (NOT Telekommunikation)

═══ COMMUNICATION ═══
Phone plans, landline, internet, VoIP → Telekommunikation (ONLY actual telecom — not SaaS, not hosting)

═══ OFFICE SUPPLIES ═══
Paper, toner, pens → Bürobedarf
Business cards, branded stationery → Werbung (marketing purpose)

═══ PROFESSIONAL SERVICES ═══
Bookkeeping, payroll → Beratung > Buchführungskosten
Tax advisor → Beratung > Steuerberater
Lawyer, notary → Beratung > Rechtsanwalt
Cleaning → Reinigungskosten
IT/management consulting (DE) → Beratung or Fremdleistungen

═══ MARKETING ═══
Advertising, SEO, online marketing → Werbung
Business gifts ≤ €50 net → Geschenke
Team events, employee gifts → Personalkosten > Aufmerksamkeiten

═══ FINANCIAL ═══
Bank fees, transaction fees → Nebenkosten des Geldverkehrs
Interest payments → Zinsaufwendungen
Government fines, penalties → Nicht abzugsfähige Aufwendungen

═══ EDUCATION & MEMBERSHIPS ═══
Training, courses, conferences (DE) → Fortbildung
Association fees, IHK → Beiträge

═══ GOODS & SUBCONTRACTORS ═══
Raw materials / goods for resale → Material/Waren > Wareneinkauf
Subcontractors / freelancers (DE) → Fremdleistungen > Freelancer/Freie Mitarbeiter

═══ FACILITIES ═══
Rent/lease for office/warehouse (NOT vehicles) → Raumkosten > Miete/Pacht
Electricity, gas, water → Raumkosten > Strom, Wasser, Gas

═══ DISAMBIGUATION ═══
Foreign services: ALWAYS §13b (EU) or §13b Drittland (non-EU). NEVER the base category.
Physical hardware is NEVER Fremdleistungen. Domains/hosting are NOT Telekommunikation.
Team meals → Personalkosten; Bewirtungskosten = external partners ONLY.

═══ FALLBACK ═══
If genuinely unclear → use UUID {zu_pruefen_uuid}"""


# ─────────────────────────────────────────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────────────────────────────────────────

def _load_outgo_categories() -> list:
    """Load all outgo posting categories from the local DB."""
    with get_db() as db:
        rows = db.execute("""
            SELECT id, name, group_name, split_allowed
            FROM   posting_categories
            WHERE  type = 'outgo'
            ORDER  BY group_name, name
        """).fetchall()
    return [dict(r) for r in rows]


def _format_categories(cats: list) -> str:
    """Format category list as compact lines for the Claude prompt."""
    lines = []
    for c in cats:
        group = c.get("group_name") or "Sonstige"
        lines.append(f"{group} > {c['name']} = {c['id']}")
    return "\n".join(lines)


def _load_vendor_rules() -> str:
    """Load optional free-text vendor rules from vendor_rules.md.

    The file is re-read on every run so edits take effect without touching code.
    Returns an empty string if the file doesn't exist or is empty.
    """
    p = Path("vendor_rules.md")
    if p.exists():
        text = p.read_text(encoding="utf-8").strip()
        if text:
            return (
                "\n\n═══ BUSINESS-SPECIFIC VENDOR RULES "
                "(highest priority — override all general rules above) ═══\n"
                + text
            )
    return ""


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _safe_float(v) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _strip_fences(raw: str) -> str:
    """Strip markdown code fences Claude sometimes wraps JSON in."""
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    return re.sub(r"\s*```$", "", cleaned.strip())


def _spaltenmethode_tax(gross: float, rate: float) -> float:
    """
    Calculate tax from a gross amount using Lexware's Spaltenmethode.
    tax = gross - gross / (1 + rate/100)
    """
    if rate <= 0:
        return 0.0
    return round(gross - gross / (1 + rate / 100), 2)


# ─────────────────────────────────────────────────────────────────────────────
# Contact matching (DB only — no contact creation)
# ─────────────────────────────────────────────────────────────────────────────

_LEGAL_SUFFIXES = re.compile(
    r'\b(?:GmbH(?:\s*&\s*Co\.?\s*KG)?|UG|AG|KG|OHG|GbR'
    r'|e\.?\s*K\.?|Einzelunternehmen|Ltd\.?|S\.A\.|B\.V\.)',
    re.IGNORECASE,
)


def _norm_name(s: str) -> str:
    """Normalise company name for fuzzy comparison."""
    if not s:
        return ""
    s = s.lower().strip()
    s = _LEGAL_SUFFIXES.sub("", s)
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _norm_vat(s: str) -> str:
    return re.sub(r"\s", "", s).upper() if s else ""


def _edit_distance(a: str, b: str) -> int:
    """Levenshtein distance (pure Python — no external dependency)."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i]
        for j, cb in enumerate(b, 1):
            curr.append(min(
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + (0 if ca == cb else 1),
            ))
        prev = curr
    return prev[-1]


def lookup_contact(inv: InvoiceData) -> Optional[str]:
    """
    Look up the vendor contact in the local DB only. No API calls. No creation.

    Priority (highest confidence first):
      1. VAT ID exact match   — legally unique
      2. IBAN exact match     — globally unique
      3. Fuzzy company name   — normalised, Levenshtein ≤ 2 or token overlap

    Returns the Lexware contact UUID, or None if not found.
    """
    inv_vat  = _norm_vat(inv.vat_id or "")
    inv_iban = re.sub(r"\s", "", inv.iban or "").upper()
    inv_name = _norm_name(inv.vendor_name or "")

    # Exclude our own identifiers
    if inv_vat and inv_vat == _norm_vat(_OWN_VAT):
        inv_vat = ""
    if inv_iban and inv_iban in _OWN_IBANS:
        inv_iban = ""

    with get_db() as db:

        # 1. VAT ID exact match
        if inv_vat:
            row = db.execute(
                "SELECT id FROM contacts WHERE UPPER(REPLACE(vat_id,' ','')) = ?",
                (inv_vat,),
            ).fetchone()
            if row:
                return row["id"]

        # 2. IBAN exact match
        if inv_iban:
            row = db.execute(
                "SELECT id FROM contacts WHERE UPPER(REPLACE(iban,' ','')) = ?",
                (inv_iban,),
            ).fetchone()
            if row:
                return row["id"]

        # 3. Fuzzy company name (vendor contacts only)
        if inv_name:
            rows = db.execute(
                "SELECT id, name FROM contacts WHERE role_vendor = 1"
            ).fetchall()

            best_id    = None
            best_score = 0

            for row in rows:
                n = _norm_name(row["name"] or "")
                if not n:
                    continue

                dist = _edit_distance(inv_name, n)
                if dist == 0:
                    score = 80
                elif dist <= 2:
                    score = 60
                elif dist <= 5 and len(inv_name) > 8:
                    inv_tok = set(inv_name.split())
                    c_tok   = set(n.split())
                    common  = inv_tok & c_tok
                    score   = 40 if (
                        len(common) >= 2
                        and len(common) / max(len(inv_tok), 1) >= 0.6
                    ) else 0
                else:
                    score = 0

                if score > best_score:
                    best_score = score
                    best_id    = row["id"]

            if best_id and best_score >= 60:
                return best_id

    return None


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — Send PDF to Claude, extract invoice data + select category
# ─────────────────────────────────────────────────────────────────────────────

def extract_and_classify(
    pdf_path:       Path,
    cached_prompt:  Optional[str] = None,
    cached_cats:    Optional[list] = None,
) -> tuple:
    """
    Send the full PDF binary to Claude in one combined call.
    Claude extracts all invoice data AND selects the best posting category.

    cached_prompt / cached_cats — built once by run_batch() to avoid
    repeating the DB read and string formatting on every invoice.

    Returns (InvoiceData, CategoryResult, tokens_used).
    """
    pdf_bytes = pdf_path.read_bytes()
    pdf_b64   = base64.standard_b64encode(pdf_bytes).decode("utf-8")

    if cached_prompt is not None and cached_cats is not None:
        prompt = cached_prompt
        cats   = cached_cats
    else:
        cats   = _load_outgo_categories()
        prompt = _PROMPT_TEMPLATE.format(
            own_vat        = _OWN_VAT or "our company VAT",
            categories     = _format_categories(cats),
            category_rules = _CATEGORY_RULES.format(
                zu_pruefen_uuid=ZU_PRUEFEN_OUTGO_ID,
            ),
            vendor_rules   = _load_vendor_rules(),
        )

    response = _claude_call(
        model      = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001"),
        max_tokens = 1400,
        system     = _SYSTEM,
        messages   = [{
            "role":    "user",
            "content": [
                {
                    "type":   "document",
                    "source": {
                        "type":       "base64",
                        "media_type": "application/pdf",
                        "data":       pdf_b64,
                    },
                },
                {"type": "text", "text": prompt},
            ],
        }],
    )

    tokens  = response.usage.input_tokens + response.usage.output_tokens
    cleaned = _strip_fences(response.content[0].text)

    try:
        data = json.loads(cleaned)
        if isinstance(data, list):
            data = data[0] if data else {}
    except json.JSONDecodeError:
        print(f"  [error] Claude returned invalid JSON: {cleaned[:200]}")
        return (
            InvoiceData(
                vendor_name=None, iban=None, vat_id=None, tax_number=None,
                invoice_number=None, invoice_date=None, due_date=None,
                total_gross=None, total_tax=None,
            ),
            CategoryResult(
                category_id=ZU_PRUEFEN_OUTGO_ID,
                category_name="Zu prüfen",
                group_name="Zu prüfen",
                method="fallback",
            ),
            tokens,
        )

    # ── Parse tax_items ───────────────────────────────────────────────────
    tax_items = []
    for item in data.get("tax_items") or []:
        if not isinstance(item, dict):
            continue
        try:
            tax_items.append(TaxItem(
                rate  = float(item.get("rate",  0)),
                net   = float(item.get("net",   0)),
                tax   = float(item.get("tax",   0)),
                gross = float(item.get("gross", 0)),
            ))
        except (TypeError, ValueError):
            pass

    # Synthesize one tax_item from totals if none were extracted
    if not tax_items and data.get("total_gross"):
        gross = _safe_float(data.get("total_gross")) or 0
        tax   = _safe_float(data.get("total_tax"))   or 0
        net   = round(gross - tax, 2)
        rate  = round((tax / net) * 100, 0) if net > 0 else 0.0
        tax_items.append(TaxItem(rate=rate, net=net, tax=tax, gross=gross))

    inv = InvoiceData(
        vendor_name         = data.get("vendor_name"),
        iban                = data.get("iban"),
        vat_id              = data.get("vat_id"),
        tax_number          = data.get("tax_number"),
        invoice_number      = data.get("invoice_number"),
        invoice_date        = data.get("invoice_date"),
        due_date            = data.get("due_date"),
        total_gross         = _safe_float(data.get("total_gross")),
        total_tax           = _safe_float(data.get("total_tax")),
        tax_items           = tax_items,
        tax_type            = data.get("tax_type", "gross"),
        category_suggestion = data.get("category_suggestion"),
    )

    # ── Validate returned category UUID ──────────────────────────────────
    raw_uuid  = (data.get("category_id") or "").strip().strip('"')
    valid_ids = {c["id"] for c in cats}
    valid_ids.add(ZU_PRUEFEN_OUTGO_ID)

    if raw_uuid in valid_ids:
        match = next((c for c in cats if c["id"] == raw_uuid), None)
        cat = CategoryResult(
            category_id   = raw_uuid,
            category_name = match["name"]       if match else "Zu prüfen",
            group_name    = (match.get("group_name") or "Zu prüfen") if match else "Zu prüfen",
            method        = "claude",
        )
    else:
        print(f"  [warn] Claude returned unknown category UUID {raw_uuid!r} — falling back")
        cat = CategoryResult(
            category_id   = ZU_PRUEFEN_OUTGO_ID,
            category_name = "Zu prüfen",
            group_name    = "Zu prüfen",
            method        = "fallback",
        )

    print(
        f"  [claude] vendor={inv.vendor_name!r}  "
        f"invoice={inv.invoice_number!r}  "
        f"date={inv.invoice_date}  "
        f"gross={inv.total_gross}  "
        f"category={cat.group_name} > {cat.category_name}  "
        f"tokens={tokens}"
    )
    return inv, cat, tokens


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — Math check
# ─────────────────────────────────────────────────────────────────────────────

def math_check(inv: InvoiceData) -> tuple:
    """
    Verify that extracted tax items sum to the invoice totals.
    Tolerance: ±€0.05 to allow for rounding differences.
    Returns (passed: bool, reason: str).
    """
    if not inv.tax_items:
        return False, "no tax items extracted"

    calc_gross = round(sum(i.gross for i in inv.tax_items), 2)
    calc_tax   = round(sum(i.tax   for i in inv.tax_items), 2)

    if inv.total_gross is not None:
        diff = abs(calc_gross - inv.total_gross)
        if diff > 0.05:
            return False, (
                f"gross mismatch: items sum to €{calc_gross:.2f} "
                f"but invoice total is €{inv.total_gross:.2f} (diff €{diff:.2f})"
            )

    if inv.total_tax is not None and inv.total_tax > 0:
        diff = abs(calc_tax - inv.total_tax)
        if diff > 0.05:
            return False, (
                f"tax mismatch: items sum to €{calc_tax:.2f} "
                f"but invoice tax is €{inv.total_tax:.2f} (diff €{diff:.2f})"
            )

    return True, ""


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 — Build PUT payload
# ─────────────────────────────────────────────────────────────────────────────

def build_update_payload(
    inv:            InvoiceData,
    contact_id:     str,
    category_id:    str,
    category_name:  str,
    math_ok:        bool,
    math_reason:    str,
    is_credit_note: bool,
) -> dict:
    """
    Assemble the PUT payload for a Zu Prüfung voucher update.

    All Zu Prüfung vouchers are updated as voucherStatus='open' (PUT cannot
    use 'unchecked' — API rejects it; only POST accepts unchecked).

    If anything is uncertain (math fail, Zu prüfen category) a remark is added
    for the bookkeeper. The payload is always valid — the voucher will be set
    to open regardless so it appears in the main ledger.

    Spaltenmethode: tax is calculated from gross amounts as
      tax = gross - gross / (1 + rate/100)
    This matches Lexware's internal calculation exactly.
    """
    remark_parts = []
    if not math_ok:
        remark_parts.append(f"Bitte prüfen: {math_reason}")
    if category_id == ZU_PRUEFEN_OUTGO_ID:
        remark_parts.append("Kategorie unbekannt — bitte manuell zuweisen")

    voucher_type = "purchaseinvoice"  # PUT cannot change type; credit note handled via remark
    if is_credit_note:
        remark_parts.append("Gutschrift — bitte Belegtyp manuell auf Gutschrift/Storno ändern")
    tax_type     = inv.tax_type or "gross"

    # ── Build voucherItems with Spaltenmethode ────────────────────────────
    # §13b reverse charge: supplier charges 0% VAT but German buyer owes 19%.
    # Lexware rejects taxRatePercent=0 with taxType="vatfree". Correct approach:
    # keep taxType="gross", set taxRatePercent=19, taxAmount=0. The §13b
    # category UUID handles the reverse-charge accounting entries automatically.
    _is_13b = "13b" in category_name.lower()

    items          = []
    total_tax_calc = 0.0

    for item in inv.tax_items:
        # For single-item invoices use the overall total_gross for precision
        amount = (
            inv.total_gross
            if len(inv.tax_items) == 1 and inv.total_gross
            else item.gross
        )
        amount = round(amount, 2)
        raw_rate = int(item.rate) if item.rate == int(item.rate) else item.rate

        _is_zu_pruefen = category_id == ZU_PRUEFEN_OUTGO_ID

        if _is_13b:
            # §13b reverse charge: always taxRatePercent=19, taxAmount=0.
            # The §13b category UUID handles the accounting; taxAmount must be 0
            # regardless of what the supplier printed on the invoice.
            rate    = 19
            tax_amt = 0.0
        elif _is_zu_pruefen:
            # "Zu prüfen" fallback only accepts rate=0 — bookkeeper will reclassify
            rate    = 0
            tax_amt = 0.0
        else:
            rate    = raw_rate
            tax_amt = (
                _spaltenmethode_tax(amount, rate)
                if tax_type == "gross"
                else round(item.tax, 2)
            )

        total_tax_calc += tax_amt
        items.append({
            "amount":         amount,
            "taxAmount":      round(tax_amt, 2),
            "taxRatePercent": rate,
            "categoryId":     category_id,
        })

    # Always use taxType="gross" — "vatfree" taxType rejects taxRatePercent=0
    # for vouchers. Genuine §4 UStG exemptions also use gross + rate=0 + taxAmount=0.
    tax_type = "gross"

    payload: dict = {
        "type":                 voucher_type,
        "voucherStatus":        "open",
        "taxType":              tax_type,
        "totalGrossAmount":     inv.total_gross,
        "totalTaxAmount":       round(total_tax_calc, 2),
        "voucherItems":         items,
        "contactId":            contact_id,
        "useCollectiveContact": False,
    }

    if inv.invoice_number:
        payload["voucherNumber"] = inv.invoice_number
    if inv.invoice_date:
        payload["voucherDate"] = inv.invoice_date
    if inv.due_date:
        payload["dueDate"] = inv.due_date
    if remark_parts:
        payload["remark"] = " | ".join(remark_parts)

    return payload


# ─────────────────────────────────────────────────────────────────────────────
# File helpers
# ─────────────────────────────────────────────────────────────────────────────

def _move_pdf(src: Path, dest_dir: Path) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / src.name
    if dest.exists():
        dest.unlink()
    shutil.move(str(src), str(dest))


# ─────────────────────────────────────────────────────────────────────────────
# Per-invoice pipeline
# ─────────────────────────────────────────────────────────────────────────────

def process_invoice(
    pdf_path:      Path,
    cached_prompt: Optional[str]  = None,
    cached_cats:   Optional[list] = None,
) -> dict:
    """
    Process a single Zu Prüfung PDF through the full pipeline.

    Returns a result dict with keys:
      status       — "open" | "skipped" | "failed"
      voucher_id   — Lexware UUID
      contact_id   — matched contact UUID or None
      vendor_name  — extracted vendor name
      category_id  — posting category UUID used
      tokens_used  — Anthropic tokens consumed
      error        — error message if failed, else None
    """
    voucher_id = pdf_path.stem   # filename without .pdf = Lexware UUID

    result = {
        "status":      "failed",
        "voucher_id":  voucher_id,
        "contact_id":  None,
        "vendor_name": None,
        "category_id": None,
        "tokens_used": 0,
        "error":       None,
    }

    print(f"\n{'─' * 60}")
    print(f"Processing: {pdf_path.name}")

    lx = LexwareClient()

    # ── Step 1: Send PDF to Claude (extract + classify) ───────────────────
    try:
        inv, cat, tokens = extract_and_classify(
            pdf_path,
            cached_prompt=cached_prompt,
            cached_cats=cached_cats,
        )
        result["tokens_used"] = tokens
        result["vendor_name"] = inv.vendor_name
        result["category_id"] = cat.category_id
    except Exception as e:
        result["error"] = f"Claude extraction failed: {e}"
        print(f"  [error] {result['error']}")
        _move_pdf(pdf_path, PDF_FAILED)
        return result

    # ── Step 2: Contact lookup (DB only — no creation) ────────────────────
    contact_id = lookup_contact(inv)
    result["contact_id"] = contact_id

    if not contact_id:
        print(
            f"  [skip] No contact found for vendor {inv.vendor_name!r}. "
            "Create the contact manually in Lexware, then re-run."
        )
        result["status"] = "skipped"
        # Leave PDF in inbox — will be retried on next run
        return result

    print(f"  [contact] matched → {contact_id}")

    # ── Step 3: Tax type guard ────────────────────────────────────────────
    # The vouchers endpoint only accepts gross / net / vatfree.
    # Extended types (externalService13b etc.) are handled by §13b categories.
    if inv.tax_type and inv.tax_type not in _VALID_TAX_TYPES:
        print(
            f"  [tax_type] {inv.tax_type!r} not valid for vouchers endpoint "
            "— forcing 'gross' (§13b category handles reverse charge)"
        )
        inv.tax_type = "gross"

    # ── Step 4: Credit note detection ────────────────────────────────────
    is_credit_note = bool(inv.total_gross is not None and inv.total_gross < 0)
    if is_credit_note:
        inv.total_gross = abs(inv.total_gross)
        inv.total_tax   = abs(inv.total_tax) if inv.total_tax is not None else 0.0
        for item in inv.tax_items:
            item.gross = abs(item.gross)
            item.net   = abs(item.net)
            item.tax   = abs(item.tax)
        print("  [credit note] negative amounts flipped — will use purchasecreditnote")

    # ── Step 5: Math check ────────────────────────────────────────────────
    math_ok, math_reason = math_check(inv)
    if not math_ok:
        print(f"  [math] FAIL — {math_reason} (will add remark, posting anyway)")

    # ── Step 6: Build payload ─────────────────────────────────────────────
    try:
        payload = build_update_payload(
            inv            = inv,
            contact_id     = contact_id,
            category_id    = cat.category_id,
            category_name  = cat.category_name,
            math_ok        = math_ok,
            math_reason    = math_reason,
            is_credit_note = is_credit_note,
        )
    except Exception as e:
        result["error"] = f"Payload build failed: {e}"
        print(f"  [error] {result['error']}")
        _move_pdf(pdf_path, PDF_FAILED)
        return result

    # ── Step 7: PUT to Lexware ────────────────────────────────────────────
    if not inv.invoice_number:
        print(f"  [skip] No invoice number found — voucher left unchanged")
        result["status"] = "skipped"
        result["error"]  = "no invoice number"
        _move_pdf(pdf_path, PDF_FAILED)
        return result

    try:
        lx.update_voucher(voucher_id, payload)
        print(
            f"  [ok] Voucher {voucher_id} updated → open  "
            f"category={cat.group_name} > {cat.category_name}"
        )
        result["status"] = "open"
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 403:
            print(f"  [skip] Voucher {voucher_id} is locked (403) — linked to bank transaction")
            result["status"] = "skipped"
            result["error"]  = "locked (403)"
            _move_pdf(pdf_path, PDF_PROCESSED)
            return result
        body = (e.response.text if e.response is not None else "")[:300]
        result["error"] = f"PUT failed: {e} — {body}"
        print(f"  [error] {result['error']}")
        _move_pdf(pdf_path, PDF_FAILED)
        return result
    except Exception as e:
        result["error"] = f"PUT failed: {e}"
        print(f"  [error] {result['error']}")
        _move_pdf(pdf_path, PDF_FAILED)
        return result

    # ── Step 8: Move PDF to processed ────────────────────────────────────
    _move_pdf(pdf_path, PDF_PROCESSED)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Batch runner
# ─────────────────────────────────────────────────────────────────────────────

def run_batch() -> dict:
    """
    Process all PDFs in pdf/inbox/ that have UUID filenames.
    Pre-builds the Claude prompt once for the whole batch (one DB read).
    Returns a summary dict: {open, skipped, failed}.
    """
    PDF_INBOX.mkdir(parents=True, exist_ok=True)

    pdfs = sorted(
        p for p in PDF_INBOX.glob("*.pdf")
        if _UUID_RE.match(p.stem)
    )

    if not pdfs:
        print("No PDFs found in pdf/inbox/ to process.")
        return {"open": 0, "skipped": 0, "failed": 0}

    print(f"\nProcessing {len(pdfs)} PDF(s) from pdf/inbox/...")

    # Build the category prompt once for the entire batch
    batch_cats   = _load_outgo_categories()
    batch_prompt = _PROMPT_TEMPLATE.format(
        own_vat        = _OWN_VAT or "our company VAT",
        categories     = _format_categories(batch_cats),
        category_rules = _CATEGORY_RULES.format(
            zu_pruefen_uuid=ZU_PRUEFEN_OUTGO_ID,
        ),
        vendor_rules   = _load_vendor_rules(),
    )

    summary = {"open": 0, "skipped": 0, "failed": 0}

    for pdf in pdfs:
        try:
            r = process_invoice(pdf, cached_prompt=batch_prompt, cached_cats=batch_cats)
            s = r.get("status", "failed")
            summary[s] = summary.get(s, 0) + 1
        except Exception as e:
            print(f"  [unexpected error] {pdf.name}: {e}")
            summary["failed"] += 1

    print(
        f"\nBatch complete — "
        f"open={summary['open']}  "
        f"skipped={summary['skipped']} (no contact)  "
        f"failed={summary['failed']}"
    )
    return summary
