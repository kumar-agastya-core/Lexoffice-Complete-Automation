# Design: Comprehensive API Expansion

**Date:** 2026-04-18  
**Status:** Approved  
**Goal:** Vollständige Buchhaltung über Claude ermöglichen — alle API-Endpunkte von Lexware Office abdecken.

---

## Vision

Der Nutzer soll seine gesamte Buchhaltung theoretisch durch Claude erledigen lassen können: Rechnungserstellung, Belegerfassung, Zahlungsverfolgung, Fehleranalyse und Automatisierungen — vollständig gesteuert über diesen MCP-Server.

---

## Architektur

Alle neuen Tools folgen dem bestehenden Muster in `src/index.ts`:
- Zod-Schema → `makeLexwareOfficeRequest` / `makeLexwareOfficeWriteRequest` → strukturierte Textantwort
- Keine neuen Dateien, keine neue Abstraktionsschicht
- Jedes Tool ist einzeln registriert, damit Claude Code-Permissions granular greifen

---

## Delivery: Wave-basiert (4 PRs)

### Wave 1 — Fehlende Read-Tools

14 neue Tools, alle nach gleichem Muster. Schnell umsetzbar, sofortiger Mehrwert.

| Tool | Endpunkt | Anmerkung |
|------|----------|-----------|
| `get-quotations` | `GET /v1/voucherlist?voucherType=quotation` | Liste via voucherlist |
| `get-quotation-details` | `GET /v1/quotations/{id}` | |
| `get-credit-notes` | `GET /v1/voucherlist?voucherType=creditnote` | |
| `get-credit-note-details` | `GET /v1/credit-notes/{id}` | |
| `get-order-confirmations` | `GET /v1/voucherlist?voucherType=orderconfirmation` | |
| `get-order-confirmation-details` | `GET /v1/order-confirmations/{id}` | |
| `get-delivery-notes` | `GET /v1/voucherlist?voucherType=deliverynote` | |
| `get-delivery-note-details` | `GET /v1/delivery-notes/{id}` | |
| `get-down-payment-invoice-details` | `GET /v1/down-payment-invoices/{id}` | Nur Detail, kein List-Endpoint |
| `get-profile` | `GET /v1/profile` | Unternehmensprofil |
| `list-print-layouts` | `GET /v1/print-layouts` | |
| `get-recurring-templates` | `GET /v1/recurring-templates` | |
| `get-articles` | `GET /v1/articles` | Mit filter: name, articleNumber |
| `get-article-details` | `GET /v1/articles/{id}` | |

### Wave 2 — Write-Operationen für fehlende Dokumenttypen

| Tool | Endpunkt |
|------|----------|
| `create-quotation` / `finalize-quotation` | `POST /v1/quotations[?finalize=true]` |
| `create-credit-note` / `finalize-credit-note` | `POST /v1/credit-notes[?finalize=true]` |
| `create-delivery-note` / `finalize-delivery-note` | `POST /v1/delivery-notes[?finalize=true]` |
| `create-order-confirmation` / `finalize-order-confirmation` | `POST /v1/order-confirmations[?finalize=true]` |
| `create-article` | `POST /v1/articles` |
| `update-article` | `PUT /v1/articles/{id}` |
| `delete-article` | `DELETE /v1/articles/{id}` |

Hinweis: `delete-article` ist destruktiv und ein eigenes Tool — kann via `denyTools` in `settings.json` individuell gesperrt werden.

### Wave 3 — File-Upload & PDF-Rendering

| Tool | Endpunkt | Beschreibung |
|------|----------|--------------|
| `upload-file` | `POST /v1/files` | Datei hochladen (PDF/Bild) |
| `attach-file-to-voucher` | `POST /v1/vouchers/{id}/files` | Datei an Voucher anhängen |
| `render-document` | `GET /v1/{type}/{id}/document` | PDF rendern für alle Dokumenttypen (invoice, quotation, credit-note, dunning, delivery-note, order-confirmation) |

### Wave 4 — Analyse-Tool & Event Subscriptions

#### `analyze-bookings`

Ein aggregierendes Tool, das intern mehrere API-Calls parallel macht und ein kompaktes Ergebnis zurückgibt. Token-freundlich: keine Rohdaten in den Kontext, nur verarbeitete Insights.

**Parameter:**
- `focus`: `all` (default) | `hygiene` | `cashflow`

**Hygiene-Checks:**
- Vouchers mit Status `unchecked` (noch nicht geprüft)
- Vouchers ohne `contactId` (kein Lieferant/Kunde zugeordnet)
- Vouchers ohne `voucherNumber` (fehlende Belegnummer)
- Mögliche Duplikate: gleicher Betrag + gleicher Kontakt innerhalb von 30 Tagen

**Cashflow-Checks:**
- Offene Rechnungen nach Fälligkeit gruppiert (heute, 7 Tage, 30 Tage, überfällig)
- Überfällige Rechnungen ohne existierende Mahnung → Mahnungsempfehlung
- Anzahlungsrechnungen ohne folgende Hauptrechnung

**Output-Struktur:**
```json
{
  "hygiene": {
    "uncheckedVouchers": 3,
    "vouchersWithoutContact": 1,
    "vouchersWithoutNumber": 2,
    "possibleDuplicates": [
      { "amount": 119.00, "contactId": "...", "dates": ["2026-04-01", "2026-04-03"] }
    ]
  },
  "cashflow": {
    "overdueInvoices": [
      { "id": "...", "customerName": "...", "amount": 500.00, "daysOverdue": 14, "hasDunning": false }
    ],
    "dueSoon": { "today": 1, "7days": 2, "30days": 5 },
    "dunningRecommendations": [
      { "invoiceId": "...", "customerName": "...", "amount": 500.00, "daysOverdue": 14 }
    ]
  }
}
```

#### Event Subscriptions (Webhooks)

| Tool | Methode | Endpunkt |
|------|---------|----------|
| `create-event-subscription` | POST | `/v1/event-subscriptions` |
| `list-event-subscriptions` | GET | `/v1/event-subscriptions` |
| `get-event-subscription` | GET | `/v1/event-subscriptions/{id}` |
| `delete-event-subscription` | DELETE | `/v1/event-subscriptions/{id}` |

**Berechtigungsmodell:**  
`delete-event-subscription` ist bewusst als eigenes Tool registriert (nicht gebündelt). Nutzer, die das Löschen von Webhooks verhindern wollen, können es in ihrer Claude Code `settings.json` explizit sperren:

```json
{
  "denyTools": ["mcp__lexoffice-fieber-it__delete-event-subscription"]
}
```

Das gleiche gilt für `delete-article`.

---

## Nicht über API verfügbar (strukturelle Grenzen)

Diese Features können grundsätzlich nicht implementiert werden, solange Lexware Office sie nicht in die API aufnimmt:

- Kontensalden / Summen-und-Saldenliste
- GuV / Bilanz
- Bankdaten / Kontoauszüge / Banktransaktionen
- Planzahlen / Budget

---

## Offene Fragen

Keine — alle Design-Entscheidungen sind getroffen und bestätigt.
