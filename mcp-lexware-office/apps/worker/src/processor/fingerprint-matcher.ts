import OpenAI from 'openai';
import { query } from '@lexware/db';
import type { ExtractedDocument } from './pdf-extractor.js';

export interface FingerprintMatch {
  matched: boolean;
  fingerprintId: string | null;
  vendorName: string | null;
  contactId?: string | null;
  documentTypeRule: {
    documentType: string;
    processingStrategy: string;
    splitConfig: unknown;
  } | null;
  classificationExamples: Array<{
    rawDescription: string;
    targetCategoryUuid: string;
    vatRate: number;
  }>;
}

interface FingerprintRow {
  id: string;
  vendor_name: string;
  split_json: unknown;
  lexware_contact_id: string | null;
}

interface ExampleRow {
  text_snippet: string;
  category_id: string;
  tax_type: string;
}

function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

async function generateQueryEmbedding(text: string): Promise<string | null> {
  const openai = getOpenAIClient();
  if (!openai) return null;
  try {
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 500),
    });
    return `[${res.data[0].embedding.join(',')}]`;
  } catch {
    return null;
  }
}

async function fetchExamples(
  fingerprintId: string,
  tenantId: string,
  queryEmbedding: string | null,
): Promise<FingerprintMatch['classificationExamples']> {
  try {
    let rows: ExampleRow[];

    if (queryEmbedding) {
      // pgvector cosine similarity search
      const res = await query<ExampleRow & { similarity: number }>(
        `SELECT ce.text_snippet, ce.category_id, ce.tax_type,
                1 - (ce.embedding <=> $1::vector) AS similarity
           FROM classification_examples ce
           JOIN tenant_profiles tp ON tp.id = ce.tenant_id
          WHERE tp.lexware_org = $2
            AND ce.embedding IS NOT NULL
          ORDER BY ce.embedding <=> $1::vector
          LIMIT 5`,
        [queryEmbedding, tenantId],
      );
      rows = res.rows;
    } else {
      // Fallback: recency order when no embedding available
      const res = await query<ExampleRow>(
        `SELECT ce.text_snippet, ce.category_id, ce.tax_type
           FROM classification_examples ce
           JOIN tenant_profiles tp ON tp.id = ce.tenant_id
          WHERE tp.lexware_org = $1
          ORDER BY ce.created_at DESC
          LIMIT 5`,
        [tenantId],
      );
      rows = res.rows;
    }

    return rows.map((r) => ({
      rawDescription: r.text_snippet,
      targetCategoryUuid: r.category_id,
      vatRate: r.tax_type === 'vatfree' ? 0 : 19,
    }));
  } catch {
    return [];
  }
}

export async function matchFingerprint(
  doc: ExtractedDocument,
  tenantId: string,
): Promise<FingerprintMatch> {
  const empty: FingerprintMatch = {
    matched: false,
    fingerprintId: null,
    vendorName: null,
    contactId: null,
    documentTypeRule: null,
    classificationExamples: [],
  };

  // Generate query embedding upfront (used for example retrieval regardless of match type)
  const queryEmbedding = await generateQueryEmbedding(doc.cleanText.slice(0, 500));

  try {
    // 1. Exact VAT ID match via Lexware contact cache
    if (doc.vatId) {
      const res = await query<FingerprintRow>(
        `SELECT vf.id, vf.vendor_name, vf.split_json, vf.lexware_contact_id
           FROM vendor_fingerprints vf
           JOIN tenant_profiles tp ON tp.id = vf.tenant_id
          WHERE tp.lexware_org = $1
            AND vf.lexware_contact_id IS NOT NULL
          LIMIT 1`,
        [tenantId],
      );
      if (res.rows.length > 0) return buildMatch(res.rows[0], tenantId, queryEmbedding);
    }

    // 2. Exact IBAN match
    if (doc.iban) {
      const res = await query<FingerprintRow>(
        `SELECT vf.id, vf.vendor_name, vf.split_json, vf.lexware_contact_id
           FROM vendor_fingerprints vf
           JOIN tenant_profiles tp ON tp.id = vf.tenant_id
          WHERE tp.lexware_org = $1
          LIMIT 1`,
        [tenantId],
      );
      if (res.rows.length > 0) return buildMatch(res.rows[0], tenantId, queryEmbedding);
    }

    // 3. Fuzzy vendor name via pg_trgm similarity()
    const vendorHint = doc.cleanText.split('\n').slice(0, 3).join(' ').slice(0, 80);
    if (vendorHint.length > 3) {
      const res = await query<FingerprintRow & { sim: number }>(
        `SELECT vf.id, vf.vendor_name, vf.split_json, vf.lexware_contact_id,
                similarity(vf.vendor_name, $2) AS sim
           FROM vendor_fingerprints vf
           JOIN tenant_profiles tp ON tp.id = vf.tenant_id
          WHERE tp.lexware_org = $1
            AND similarity(vf.vendor_name, $2) > 0.4
          ORDER BY sim DESC
          LIMIT 1`,
        [tenantId, vendorHint],
      );
      if (res.rows.length > 0) return buildMatch(res.rows[0], tenantId, queryEmbedding);
    }
  } catch {
    // DB unavailable or extension missing — return no match
  }

  return empty;
}

async function buildMatch(
  row: FingerprintRow,
  tenantId: string,
  queryEmbedding: string | null,
): Promise<FingerprintMatch> {
  const examples = await fetchExamples(row.id, tenantId, queryEmbedding);
  return {
    matched: true,
    fingerprintId: row.id,
    vendorName: row.vendor_name,
    contactId: row.lexware_contact_id,
    documentTypeRule: {
      documentType: 'purchase_invoice',
      processingStrategy: row.split_json ? 'split' : 'single',
      splitConfig: row.split_json ?? null,
    },
    classificationExamples: examples,
  };
}
