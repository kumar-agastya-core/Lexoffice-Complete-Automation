import type Anthropic from '@anthropic-ai/sdk';

export const CLASSIFY_PURCHASE_INVOICE_TOOL: Anthropic.Tool = {
  name: 'classify_purchase_invoice',
  description: 'Classify an incoming invoice and assign Lexware posting categories',
  input_schema: {
    type: 'object',
    required: ['voucherType', 'taxType', 'lineItems', 'overallConfidence'],
    properties: {
      voucherType: {
        type: 'string',
        enum: ['purchaseinvoice', 'purchasecreditnote'],
      },
      taxType: {
        type: 'string',
        enum: [
          'gross', 'net', 'vatfree', 'externalService13b',
          'constructionService13b', 'intraCommunitySupply',
          'photovoltaicEquipment', 'thirdPartyCountryService',
        ],
      },
      lineItems: {
        type: 'array',
        items: {
          type: 'object',
          required: ['grossAmount', 'taxAmount', 'taxRatePercent', 'categoryId', 'confidence'],
          properties: {
            description: { type: 'string' },
            grossAmount: { type: 'number' },
            taxAmount: { type: 'number' },
            taxRatePercent: { type: 'number', enum: [0, 5, 7, 16, 19] },
            categoryId: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
      overallConfidence: { type: 'number', minimum: 0, maximum: 1 },
      reasoning: { type: 'string' },
      flags: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['GWG_CANDIDATE', 'LOAN_DETECTED', 'PERIOD_MISMATCH', 'REVERSE_CHARGE', 'SPLIT_REQUIRED'],
        },
      },
    },
  },
};

export const CLASSIFY_SETTLEMENT_TOOL: Anthropic.Tool = {
  name: 'classify_settlement',
  description: 'Classify a settlement document into multiple Lexware vouchers',
  input_schema: {
    type: 'object',
    required: ['vouchers', 'overallConfidence'],
    properties: {
      vouchers: {
        type: 'array',
        description: 'Each entry becomes a separate Lexware voucher',
        items: {
          type: 'object',
          required: ['voucherType', 'taxType', 'lineItems', 'description'],
          properties: {
            description: { type: 'string' },
            voucherType: { type: 'string', enum: ['salesinvoice', 'purchaseinvoice'] },
            taxType: { type: 'string' },
            useCollectiveContact: { type: 'boolean' },
            lineItems: {
              type: 'array',
              items: {
                type: 'object',
                required: ['grossAmount', 'taxAmount', 'taxRatePercent', 'categoryId'],
                properties: {
                  label: { type: 'string' },
                  grossAmount: { type: 'number' },
                  taxAmount: { type: 'number' },
                  taxRatePercent: { type: 'number' },
                  categoryId: { type: 'string' },
                },
              },
            },
          },
        },
      },
      loanRepaymentDetected: { type: 'boolean' },
      loanAmount: { type: 'number' },
      overallConfidence: { type: 'number', minimum: 0, maximum: 1 },
      reasoning: { type: 'string' },
    },
  },
};

export const REQUEST_CLARIFICATION_TOOL: Anthropic.Tool = {
  name: 'request_clarification',
  description: 'Signal that classification is not possible and request human input',
  input_schema: {
    type: 'object',
    required: ['reason', 'question'],
    properties: {
      reason: { type: 'string' },
      question: { type: 'string' },
      suggestedCategoryId: { type: 'string' },
    },
  },
};
