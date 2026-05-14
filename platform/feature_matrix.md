# Account Type Feature Matrix

---

## SOLO ACCOUNT

**Definition:** One user. One Lexware account. Personal bookkeeping.  
**Plans:** starter / solo / profi

### Core Features (all solo plans)

| Feature | starter | solo | profi |
|---------|---------|------|-------|
| Chat with AI bookkeeper | ✓ | ✓ | ✓ |
| PDF invoice upload + auto-booking | ✓ | ✓ | ✓ |
| Vendor rules DB (learns over time) | ✓ | ✓ | ✓ |
| Conversation history | ✓ | ✓ | ✓ |
| Audit log of own actions | ✓ | ✓ | ✓ |
| All 96 Lexware tools | ✓ | ✓ | ✓ |
| Settlement CSV processing | ✓ | ✓ | ✓ |
| Overdue invoice dunning workflow | ✓ | ✓ | ✓ |
| Monthly spending report | ✓ | ✓ | ✓ |
| **Monthly actions** | 50 | 200 | 600 |
| **Monthly PDFs** | 10 | 50 | unlimited |
| **Price** | free | €29/mo | €69/mo |

### Account Settings
- Profile: name, email, language preference
- API key management: connect/reconnect Lexware account
- Billing: plan, payment method, invoices, top-ups
- Data export: download audit log as CSV

---

## TEAM ACCOUNT

**Definition:** Multiple users sharing one workspace. Shared Lexware accounts (up to 3).  
**Plan:** business (€49/month)

### Everything in profi, plus:

| Feature | Detail |
|---------|--------|
| **Team members** | Up to 3 users |
| **Lexware connections** | Up to 3 separate Lexware accounts |
| **Shared rules DB** | Vendor rules set by any member apply to all |
| **Shared conversation history** | All members see all conversations |
| **Role-based access** | owner / admin / member / viewer |
| **Monthly actions** | 2000 (pooled across all members) |
| **Monthly PDFs** | unlimited |

### Role Permissions

| Permission | viewer | member | admin | owner |
|-----------|--------|--------|-------|-------|
| View conversations + audit log | ✓ | ✓ | ✓ | ✓ |
| View usage + billing info | ✓ | ✓ | ✓ | ✓ |
| Use agent + upload PDFs | | ✓ | ✓ | ✓ |
| Manage vendor rules | | ✓ | ✓ | ✓ |
| Invite / remove members | | | ✓ | ✓ |
| Update workspace settings | | | ✓ | ✓ |
| Manage Lexware connections | | | ✓ | ✓ |
| Billing + plan changes | | | | ✓ |
| Delete workspace | | | | ✓ |

### Approval Workflow (future)
Members can flag a voucher creation for admin review before posting. Admin sees flagged items in a review queue. This prevents junior team members from posting incorrect bookings. (Not in v1 — planned for v2.)

---

## AGENCY ACCOUNT (Buchhalter)

**Definition:** One Buchhalter (tax advisor / bookkeeper) managing multiple client businesses.  
**Plan:** buchhalter (€99/month base + €8/additional client after 5)

### Everything in business, plus:

| Feature | Detail |
|---------|--------|
| **Agency dashboard** | All clients in one view: status, usage, last activity |
| **Unlimited client workspaces** | First 5 included, €8/month per additional |
| **Per-client isolation** | Own Lexware key, own rules DB, own history |
| **Per-client audit log** | Never mixed with other clients |
| **Client invite system** | Invite link → client connects own Lexware key |
| **Direct access model** | Buchhalter connects client key themselves |
| **Bulk processing queue** | Queue PDFs across all clients for overnight processing |
| **Consolidated reporting** | Spending across all clients by category |
| **Unlimited agency team** | Add Buchhalter staff members |
| **White-label add-on** | +€49/month, see below |
| **Monthly actions** | 10000 (pooled across all clients) |

### Client Workspace Isolation

Each client sub-workspace is completely isolated:

```
Agency Workspace (buchhalter account)
├── Client: Bäckerei Schmidt GmbH
│   ├── lexware_connection: Schmidt's API key (encrypted)
│   ├── rules DB: /data/workspaces/{agency_id}/clients/{clientA_id}/lexware.db
│   ├── conversation history: visible only in Schmidt context
│   └── audit log: Schmidt's actions only
│
├── Client: IT Consulting Müller
│   ├── lexware_connection: Müller's API key (encrypted)
│   ├── rules DB: /data/workspaces/{agency_id}/clients/{clientB_id}/lexware.db
│   ├── conversation history: visible only in Müller context
│   └── audit log: Müller's actions only
│
└── [Client rules never cross-contaminate]
```

### Client Invite Flow

**Model A — Self-service (client connects own key):**
1. Buchhalter creates client workspace in dashboard
2. Platform sends invite email to `client_email`
3. Client clicks link → sees a simple one-page form (no account required)
4. Client enters their Lexware API key → platform verifies and encrypts
5. `invite_accepted_at` set → Buchhalter can now access client's Lexware
6. Client never logs into the platform again — Buchhalter manages everything

**Model B — Direct access (Buchhalter connects key):**
1. Buchhalter creates client workspace in dashboard
2. Buchhalter enters client's Lexware API key directly
3. No invite email needed — key entered by Buchhalter on behalf of client
4. Suitable when client has shared the key out-of-band (common in Steuerberatung)

### White-Label Add-On (+€49/month)

When enabled:
- Custom domain: `https://buchhalter-name.de` or `https://portal.buchhalter-name.de`
- Custom logo (uploaded via settings) shown in header and emails
- Custom brand name throughout the UI
- Custom primary colour
- Powered-by attribution hidden from client-facing views
- Client invite emails sent from Buchhalter's domain (requires DNS SPF/DKIM setup)
- SSL certificate provisioned automatically via Let's Encrypt on custom domain

The white-label domain is a reverse proxy to the LexwareAI platform — no separate deployment required. The domain is stored in `workspaces.white_label_domain` and resolved by a Fastify middleware that reads the `Host` header and loads the correct workspace branding.

### Consolidated Reporting

The agency dashboard provides:
- **Client overview:** table of all clients with actions used, last activity, connection status
- **Spending by category (cross-client):** e.g. "Total Fremdleistungen across all clients this month: €24,840"
- **Per-client monthly summary:** download per-client spending report as PDF
- **Upcoming recurring invoices:** aggregated from all connected Lexware accounts

All reports pull from `audit_log` and live Lexware API data — no raw financial data stored on platform.

---

## Feature Comparison Summary

| Feature | starter | solo | profi | business | buchhalter |
|---------|---------|------|-------|----------|-----------|
| Chat + agent | ✓ | ✓ | ✓ | ✓ | ✓ |
| PDF upload | ✓ | ✓ | ✓ | ✓ | ✓ |
| All 96 tools | ✓ | ✓ | ✓ | ✓ | ✓ |
| Actions/month | 50 | 200 | 600 | 2000 | 10000 |
| PDFs/month | 10 | 50 | ∞ | ∞ | ∞ |
| Team members | 1 | 1 | 1 | 3 | ∞ |
| Lexware accounts | 1 | 1 | 1 | 3 | per client |
| Client workspaces | — | — | — | — | ∞ |
| Role-based access | — | — | — | ✓ | ✓ |
| White-label | — | — | — | — | add-on |
| Price/month | free | €29 | €69 | €49 | €99+ |
