# Usage Control Implementation

---

## Plan Limits Table

| Plan       | Actions/mo | PDFs/mo | Unlimited PDFs | Lexware accounts | Team members | Anthropic cost cap |
|------------|-----------|---------|---------------|-----------------|-------------|-------------------|
| starter    | 50        | 10      | no            | 1               | 1           | €4                |
| solo       | 200       | 50      | no            | 1               | 1           | €16               |
| profi      | 600       | 999     | yes           | 1               | 1           | €45               |
| business   | 2000      | 999     | yes           | 3               | 3           | €100              |
| buchhalter | 10000     | 999     | yes           | 1 (+clients)    | unlimited   | €350 (pooled)     |

---

## Limit Enforcement (before every agent action)

```typescript
async function checkUsageLimits(workspaceId: string): Promise<UsageCheckResult> {
  // 1. Load current month usage
  const yearMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const monthly = await db.query(
    `SELECT actions_used, pdfs_used, total_cost_eur FROM usage_monthly
     WHERE workspace_id = $1 AND year_month = $2`,
    [workspaceId, yearMonth]
  );
  const actionsUsed = monthly?.actions_used ?? 0;
  const costEur = parseFloat(monthly?.total_cost_eur ?? '0');

  // 2. Load workspace limits
  const workspace = await db.query(
    `SELECT monthly_actions_limit, plan FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  const limit = workspace.monthly_actions_limit;
  const costCap = PLAN_COST_CAPS[workspace.plan];

  // 3. Add unused top-up actions
  const topups = await db.query(
    `SELECT COALESCE(SUM(quantity - used), 0) AS remaining
     FROM usage_topups
     WHERE workspace_id = $1 AND topup_type = 'actions'
       AND (expires_at IS NULL OR expires_at > now())`,
    [workspaceId]
  );
  const topupRemaining = parseInt(topups.remaining);
  const effectiveLimit = limit + topupRemaining;

  // 4. Hard block: limit exhausted
  if (actionsUsed >= effectiveLimit) {
    return {
      allowed: false,
      reason: 'limit_exhausted',
      actions_used: actionsUsed,
      actions_limit: effectiveLimit,
      upgrade_url: '/billing',
    };
  }

  // 5. Hard block: Anthropic cost cap reached
  if (costEur >= costCap) {
    return {
      allowed: false,
      reason: 'cost_cap_reached',
      message: 'Anthropic cost cap for this month reached. Remaining actions available tomorrow.',
    };
  }

  // 6. Soft warning: 90% of actions used
  const warning90 = actionsUsed >= Math.floor(effectiveLimit * 0.9);

  // 7. Model switch: 80% of cost cap → downgrade to Haiku for this request
  const useCheaperModel = costEur >= costCap * 0.8;

  // 8. Email warning: 80% of actions (once per month — checked via Redis flag)
  if (actionsUsed >= Math.floor(effectiveLimit * 0.8)) {
    await maybeSendUsageWarningEmail(workspaceId, actionsUsed, effectiveLimit);
  }

  return {
    allowed: true,
    warning: warning90 ? { actions_used: actionsUsed, actions_limit: effectiveLimit } : null,
    model_override: useCheaperModel ? 'claude-haiku-4-5-20251001' : null,
  };
}
```

---

## Usage Recording (after every completed action)

```typescript
async function recordUsage(params: {
  workspaceId: string;
  clientWorkspaceId: string | null;
  userId: string;
  tokensUsed: number;
  anthropicCostEur: number;
  actionDescription: string;
}) {
  const yearMonth = new Date().toISOString().slice(0, 7);

  // Insert event
  await db.query(
    `INSERT INTO usage_events
       (workspace_id, client_workspace_id, user_id, event_type, action_description, tokens_used, anthropic_cost_eur)
     VALUES ($1, $2, $3, 'action', $4, $5, $6)`,
    [params.workspaceId, params.clientWorkspaceId, params.userId,
     params.actionDescription, params.tokensUsed, params.anthropicCostEur]
  );

  // Upsert monthly summary (atomic increment)
  await db.query(
    `INSERT INTO usage_monthly (workspace_id, year_month, actions_used, total_tokens, total_cost_eur)
     VALUES ($1, $2, 1, $3, $4)
     ON CONFLICT (workspace_id, year_month) DO UPDATE SET
       actions_used   = usage_monthly.actions_used + 1,
       total_tokens   = usage_monthly.total_tokens + EXCLUDED.total_tokens,
       total_cost_eur = usage_monthly.total_cost_eur + EXCLUDED.total_cost_eur`,
    [params.workspaceId, yearMonth, params.tokensUsed, params.anthropicCostEur]
  );

  // Consume top-up credits if base limit exhausted (use base limit, not effective limit)
  const workspace = await db.query(
    `SELECT monthly_actions_limit FROM workspaces WHERE id = $1`, [params.workspaceId]
  );
  const monthly = await db.query(
    `SELECT actions_used FROM usage_monthly WHERE workspace_id = $1 AND year_month = $2`,
    [params.workspaceId, yearMonth]
  );
  if (monthly.actions_used > workspace.monthly_actions_limit) {
    await db.query(
      `UPDATE usage_topups SET used = used + 1
       WHERE id = (
         SELECT id FROM usage_topups
         WHERE workspace_id = $1 AND topup_type = 'actions'
           AND used < quantity
           AND (expires_at IS NULL OR expires_at > now())
         ORDER BY purchased_at ASC
         LIMIT 1
       )`,
      [params.workspaceId]
    );
  }
}
```

---

## Top-Up Pricing

| Product        | Quantity   | Price   | Unit cost    |
|---------------|-----------|---------|-------------|
| actions_100   | 100 actions | €9.00  | €0.09/action |
| actions_250   | 250 actions | €19.00 | €0.076/action |
| pdfs_50       | 50 PDFs    | €7.00   | €0.14/PDF    |
| pdfs_100      | 100 PDFs   | €12.00  | €0.12/PDF    |

Top-ups expire at end of billing month (`expires_at = end of current billing period`). They do not roll over. The Stripe payment for top-ups is a `PaymentIntent` (one-time charge), not a subscription line item.

---

## Anthropic Cost Caps Per Plan

| Plan       | Monthly Anthropic cap | 80% threshold (model switch) | 100% threshold (queue) |
|------------|----------------------|------------------------------|------------------------|
| starter    | €4.00                | €3.20                        | €4.00                  |
| solo       | €16.00               | €12.80                       | €16.00                 |
| profi      | €45.00               | €36.00                       | €45.00                 |
| business   | €100.00              | €80.00                       | €100.00                |
| buchhalter | €350.00              | €280.00                      | €350.00                |

**At 80% of cost cap:** switch remaining requests to `claude-haiku-4-5-20251001` for that workspace for the rest of the month. Haiku is ~20× cheaper per token — extends effective capacity without hard-stopping the user.

**At 100% of cost cap:** return `429` with message: _"You've reached your AI budget for this month. Actions resume on [first of next month]."_ The user can still view conversation history and audit log. No new agent actions until month rolls over.

**For buchhalter:** cost cap is pooled across all client workspaces under the agency. Individual client cost tracking is still logged in `usage_events.client_workspace_id` for reporting, but the cap applies to `workspace_id` total.

---

## Redis Usage for Limit Checks

Limit checks hit Redis (Upstash) first for sub-millisecond response:

```
Key: usage:{workspace_id}:{YYYY-MM}:actions   → integer counter
Key: usage:{workspace_id}:{YYYY-MM}:cost      → float, multiplied by 1000 for integer storage
Key: usage:{workspace_id}:warning_sent:{YYYY-MM} → "1" if 80% warning email sent this month
TTL: 35 days (auto-expires after month + buffer)
```

Redis counters are incremented on every action (INCR is atomic). The PostgreSQL `usage_monthly` table is the source of truth — Redis is a fast read cache. On mismatch (Redis eviction), fall back to PostgreSQL.

---

## Plan Change Effects on Limits

On upgrade:
- `workspaces.monthly_actions_limit` and related columns updated immediately
- User gets new limit instantly — no wait for billing cycle
- Stripe proration charges difference

On downgrade:
- New limit takes effect at start of next billing period
- If current month usage already exceeds new limit, user is not blocked mid-month
- Warning shown in dashboard: "Your limit will decrease on [date]"

On cancellation:
- Workspace reverts to `starter` limits at `plan_ends_at`
- Top-up packs purchased in final month: valid until end of that month
