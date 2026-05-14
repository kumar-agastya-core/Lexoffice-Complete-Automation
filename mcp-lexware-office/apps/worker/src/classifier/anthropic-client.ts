import Anthropic from '@anthropic-ai/sdk';
import type { TenantProfile, PostingCategory, ClassificationResult, PurchaseInvoiceToolOutput, SettlementToolOutput, ClarificationToolOutput } from '../types.js';
import {
  CLASSIFY_PURCHASE_INVOICE_TOOL,
  CLASSIFY_SETTLEMENT_TOOL,
  REQUEST_CLARIFICATION_TOOL,
} from './tools.js';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 2048;
const CONFIDENCE_THRESHOLD = 0.75;

const ZU_PRUEFEN = '8d2e71c6-09d5-439a-a295-a9e71661afcd';

type SystemBlock = { type: 'text'; text: string; cache_control: { type: 'ephemeral' } };

export function buildSystemPrompt(tenant: TenantProfile, categories: PostingCategory[]): string {
  const catJson = JSON.stringify(
    categories.map((c) => ({ id: c.id, name: c.name, type: c.type, group: c.groupName })),
    null,
    2,
  );
  return `You are an expert German tax bookkeeping engine for Lexware Office.

OPERATIONAL CONTEXT:
Business Type: ${tenant.industryOperationalLens}
Tax Framework: ${tenant.taxFramework}
VAT Registration: ${tenant.smallBusiness ? 'Kleinunternehmer §19 UStG — all invoices vatfree' : 'Standard VAT registration'}

GERMAN TAX RULES:
- Food delivery revenue (Lieferando/Takeaway): 7% VAT (§12 Abs.2 Nr.1 UStG)
- Restaurant in-house service: 19% VAT
- Tips (Trinkgelder): 0% VAT — taxType=vatfree
- EU vendor (non-DE VAT ID) with 0% shown: taxType=externalService13b — buyer self-assesses 19%
- Construction services with §13b: taxType=constructionService13b
- §19 UStG / Kleinunternehmer on invoice: taxType=vatfree
- innergemeinschaftlich: taxType=intraCommunitySupply
- GWG threshold (Geringwertigtes Wirtschaftsgut): €800 net — flag GWG_CANDIDATE

VALID POSTING CATEGORIES (use exact UUIDs):
${catJson}

FALLBACK CATEGORY: Use "${ZU_PRUEFEN}" (Zu prüfen) when genuinely uncertain.

RULES:
- Always use exact category UUIDs from the list above
- Return confidence 0.0–1.0 per line item and overall
- grossAmount = net + taxAmount for each line item
- For settlements: first voucher = revenue (salesinvoice), subsequent = fees (purchaseinvoice)`;
}

export type ClassifyToolName = 'classify_purchase_invoice' | 'classify_settlement';

function buildSystemBlocks(tenant: TenantProfile, categories: PostingCategory[]): SystemBlock[] {
  return [
    {
      type: 'text' as const,
      text: buildSystemPrompt(tenant, categories),
      cache_control: { type: 'ephemeral' as const },
    },
  ];
}

function extractToolResult(
  response: Anthropic.Message,
  toolName: ClassifyToolName,
): ClassificationResult {
  const toolUse = response.content.find((b) => b.type === 'tool_use');

  if (!toolUse || toolUse.type !== 'tool_use') {
    const clarification: ClarificationToolOutput = {
      reason: 'model did not return structured output',
      question: 'I was unable to classify this document automatically. Please review and assign the category manually.',
    };
    return { kind: 'clarification_needed', data: clarification, confidence: 0, passUsed: 1 };
  }

  if (toolUse.name === 'request_clarification') {
    return {
      kind: 'clarification_needed',
      data: toolUse.input as ClarificationToolOutput,
      confidence: 0,
      passUsed: 1,
    };
  }

  if (toolUse.name === 'classify_purchase_invoice') {
    const data = toolUse.input as PurchaseInvoiceToolOutput;
    return { kind: 'purchase_invoice', data, confidence: data.overallConfidence, passUsed: 1 };
  }

  if (toolUse.name === 'classify_settlement') {
    const data = toolUse.input as SettlementToolOutput;
    return { kind: 'settlement', data, confidence: data.overallConfidence, passUsed: 1 };
  }

  const clarification: ClarificationToolOutput = {
    reason: `unexpected tool called: ${toolUse.name}`,
    question: 'Unexpected classification response. Please review manually.',
  };
  return { kind: 'clarification_needed', data: clarification, confidence: 0, passUsed: 1 };
}

function withPass(result: ClassificationResult, pass: 1 | 2): ClassificationResult {
  return { ...result, passUsed: pass };
}

export class AnthropicClassifier {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async classifyStandard(params: {
    toolName: ClassifyToolName;
    tenant: TenantProfile;
    categories: PostingCategory[];
    userMessage: string;
  }): Promise<ClassificationResult> {
    const { toolName, tenant, categories, userMessage } = params;
    const tools = getToolsForName(toolName);
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemBlocks(tenant, categories) as Anthropic.TextBlockParam[],
      messages: [{ role: 'user', content: userMessage }],
      tools,
      tool_choice: { type: 'tool', name: toolName },
    });
    return withPass(extractToolResult(response, toolName), 1);
  }

  async classifyWithVision(params: {
    toolName: ClassifyToolName;
    tenant: TenantProfile;
    categories: PostingCategory[];
    userMessage: string;
    pdfBuffer: Buffer;
  }): Promise<ClassificationResult> {
    const { toolName, tenant, categories, userMessage, pdfBuffer } = params;
    const base64 = pdfBuffer.toString('base64');
    const tools = getToolsForName(toolName);

    const userContent: Anthropic.MessageParam['content'] = [
      {
        type: 'text',
        text: userMessage,
      },
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64,
        },
      } as unknown as Anthropic.TextBlockParam,
    ];

    const response = await this.client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemBlocks(tenant, categories) as Anthropic.TextBlockParam[],
        messages: [{ role: 'user', content: userContent }],
        tools,
        tool_choice: { type: 'tool', name: toolName },
      },
      {
        headers: {
          'anthropic-beta': 'pdfs-2024-09-25,prompt-caching-2024-07-31',
        },
      },
    );
    const result = extractToolResult(response, toolName);
    return withPass(result, 2);
  }
}

function getToolsForName(name: ClassifyToolName): Anthropic.Tool[] {
  if (name === 'classify_settlement') {
    return [CLASSIFY_SETTLEMENT_TOOL, REQUEST_CLARIFICATION_TOOL];
  }
  return [CLASSIFY_PURCHASE_INVOICE_TOOL, REQUEST_CLARIFICATION_TOOL];
}

export { CONFIDENCE_THRESHOLD };
