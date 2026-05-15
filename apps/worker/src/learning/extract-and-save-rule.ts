import { query } from '@lexware/db';
import type { ClassificationResult } from '../types.js';
import type { ExtractedDocument } from '../processor/pdf-extractor.js';

interface ExtractedRule {
  vendorName: string;
  vatId: string | null;
  categoryId: string;
  taxType: string;
  voucherType: string;
  notes: string;
}

export async function extractAndSaveRule(params: {
  userAnswer: string;
  classificationResult: ClassificationResult;
  extracted: ExtractedDocument;
  tenantId: string;
  anthropicApiKey: string;
}): Promise<void> {
  try {
    const { userAnswer, classificationResult, extracted, tenantId, anthropicApiKey } = params;

    const vendorName = (extracted as unknown as { vendorName?: string }).vendorName
      ?? extracted.cleanText.split('\n')[0]?.trim()
      ?? 'unknown';

    const systemPrompt =
      'You are a bookkeeping classification rule extractor. Extract a structured vendor rule from the user\'s answer and the classification result. Return ONLY valid JSON, no markdown, no explanation.';

    const userPrompt = `
User answered this clarification question with: "${userAnswer}"

The document was from vendor: "${vendorName}"
Vendor VAT ID: "${extracted.vatId ?? 'none'}"
Invoice total: €${extracted.totalGrossAmount ?? 0}

The system classified it as: ${JSON.stringify(classificationResult, null, 2)}

Extract a JSON rule with this exact schema:
{
  "vendorName": "normalized vendor name",
  "vatId": "VAT ID or null",
  "categoryId": "the Lexware category UUID that should be used",
  "taxType": "gross | net | vatfree",
  "voucherType": "purchaseinvoice | salesinvoice",
  "notes": "short human-readable explanation of when this rule applies"
}
`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      console.warn('[learning] Anthropic API error:', response.status);
      return;
    }

    const data = await response.json() as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text ?? '';

    let rule: ExtractedRule;
    try {
      rule = JSON.parse(text) as ExtractedRule;
    } catch {
      console.warn('[learning] Failed to parse rule JSON from Claude response:', text.slice(0, 100));
      return;
    }

    // Resolve tenant UUID
    const tenantRes = await query<{ id: string }>(
      `SELECT id FROM tenant_profiles WHERE lexware_org = $1 OR id::text = $1 LIMIT 1`,
      [tenantId],
    );
    const tenantUuid = tenantRes.rows[0]?.id;
    if (!tenantUuid) {
      console.warn(`[learning] Could not resolve tenant UUID for "${tenantId}"`);
      return;
    }

    // Upsert vendor fingerprint
    await query(
      `INSERT INTO vendor_fingerprints
         (tenant_id, vendor_name, category_id, tax_type, usage_count, created_at)
       VALUES ($1, $2, $3, $4, 1, NOW())
       ON CONFLICT (tenant_id, vendor_name) DO UPDATE SET
         category_id = EXCLUDED.category_id,
         tax_type = EXCLUDED.tax_type,
         last_used_at = NOW(),
         usage_count = vendor_fingerprints.usage_count + 1`,
      [tenantUuid, rule.vendorName, rule.categoryId, rule.taxType],
    );

    // Insert classification example
    const snippet = extracted.cleanText.slice(0, 200);
    await query(
      `INSERT INTO classification_examples
         (tenant_id, text_snippet, category_id, tax_type, voucher_type, source)
       VALUES ($1, $2, $3, $4, $5, 'user_chat')
       ON CONFLICT DO NOTHING`,
      [tenantUuid, snippet, rule.categoryId, rule.taxType, rule.voucherType],
    );

    console.log(
      `[learning] Rule saved for vendor "${rule.vendorName}" → category ${rule.categoryId}`,
    );
  } catch (err) {
    console.warn('[learning] extractAndSaveRule failed (non-fatal):', err);
  }
}
