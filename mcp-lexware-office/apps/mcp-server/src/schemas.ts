import { z } from 'zod';

export const lineItemSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.enum(['material', 'service', 'custom']),
		name: z.string().describe('Line item description'),
		description: z.string().optional(),
		quantity: z.number(),
		unitName: z.string().describe('Unit name'),
		unitPrice: z.object({
			currency: z.literal('EUR'),
			netAmount: z.number().describe('Net amount'),
			grossAmount: z.number().optional().describe('Gross amount'),
			taxRatePercentage: z.number().describe('Tax rate %'),
		}),
		discountPercentage: z.number().min(0).max(100).optional(),
	}),
	z.object({
		type: z.literal('text'),
		name: z.string().describe('Free text line'),
		description: z.string().optional(),
	}),
]);

export const invoiceAddressSchema = z.union([
	z.object({
		contactId: z.string().uuid().describe('Contact UUID'),
	}),
	z.object({
		name: z.string(),
		street: z.string().optional(),
		zip: z.string().optional(),
		city: z.string().optional(),
		countryCode: z.string().length(2).describe('ISO 3166-1 alpha-2'),
	}),
]);

export const TAX_TYPES = [
	'net',
	'gross',
	'vatfree',
	'intraCommunitySupply',
	'constructionService13b',
	'externalService13b',
	'thirdPartyCountryService',
	'thirdPartyCountryDelivery',
	'photovoltaicEquipment',
] as const;

export const taxTypeDescription =
	'net|gross|vatfree|intraCommunitySupply|constructionService13b|externalService13b|thirdPartyCountryService|thirdPartyCountryDelivery|photovoltaicEquipment';

export const shippingConditionsSchema = z.object({
	shippingDate: z.string().describe('ISO 8601 service/delivery date'),
	shippingEndDate: z.string().optional().describe('End date for period types'),
	shippingType: z
		.enum(['service', 'delivery', 'serviceperiod', 'deliveryperiod'])
		.describe('service|delivery|serviceperiod|deliveryperiod'),
});

export const paymentConditionsSchema = z.object({
	paymentTermLabel: z.string().optional().describe('Payment term label on document'),
	paymentTermLabelTemplate: z.string().optional(),
	paymentTermLabelLanguage: z.enum(['de', 'en']).optional(),
	paymentTermDuration: z.number().int().describe('Payment term days'),
	paymentDiscountConditions: z
		.object({
			discountPercentage: z.number(),
			discountRange: z.number().int().describe('Discount window days'),
		})
		.optional(),
});

export const invoiceSchema = {
	voucherDate: z.string().describe('ISO 8601 document date'),
	address: invoiceAddressSchema,
	lineItems: z.array(lineItemSchema).min(1),
	taxConditions: z.object({
		taxType: z.enum(TAX_TYPES).describe(taxTypeDescription),
		taxTypeNote: z.string().optional().describe('Optional note for vat-free types'),
	}),
	shippingConditions: shippingConditionsSchema.describe('Delivery/service conditions (required)'),
	paymentConditions: paymentConditionsSchema.optional(),
	introduction: z.string().max(2000).optional().describe('Intro text (max 2000 chars)'),
	remark: z.string().max(2000).optional().describe('Closing text (max 2000 chars)'),
	title: z.string().max(25).optional().describe('PDF title (max 25 chars)'),
	printLayoutId: z.string().uuid().optional().describe('Print layout UUID'),
};

export const quotationSchema = {
	...invoiceSchema,
	expirationDate: z.string().describe('ISO 8601 expiry date (required)'),
};

export const dunningSchema = {
	precedingSalesVoucherId: z
		.string()
		.uuid()
		.describe('ID of the invoice this dunning is for — sent as query parameter, not in body'),
	voucherDate: z.string().describe('ISO 8601 document date'),
	taxConditions: z.object({
		taxType: z.enum(TAX_TYPES).describe('Must exactly match the tax type of the referenced invoice'),
	}),
	address: invoiceAddressSchema.describe('Contact address — REQUIRED by Lexware API'),
	lineItems: z.array(lineItemSchema).describe('Dunning fee line items — REQUIRED (pass empty array [] if no extra charges)'),
	shippingConditions: shippingConditionsSchema.describe('Delivery/service conditions (required)'),
	title: z.string().max(25).optional().describe('PDF title (max 25 chars)'),
	introduction: z.string().max(2000).optional().describe('Intro text (max 2000 chars)'),
	remark: z.string().max(2000).optional().describe('Closing text (max 2000 chars)'),
};

export const VOUCHER_TAX_TYPES = [
	'gross', 'net', 'vatfree',
	'constructionService13b', 'externalService13b',
	'intraCommunitySupply', 'photovoltaicEquipment',
] as const;

export const voucherItemSchema = z.object({
	amount: z.number().describe('Gross amount'),
	taxAmount: z.number().describe('Tax amount; 0 for §13b/vatfree'),
	taxRatePercent: z.number().describe('0/5/7/16/19; use 0 for §13b/vatfree'),
	categoryId: z.string().uuid().describe('Posting category UUID; use "Zu prüfen" if uncertain'),
});

export const EVENT_TYPES = [
	'voucher.created', 'voucher.changed', 'voucher.deleted',
	'invoice.created', 'invoice.changed', 'invoice.deleted', 'invoice.status.changed',
	'quotation.created', 'quotation.changed', 'quotation.deleted', 'quotation.status.changed',
	'order-confirmation.created', 'order-confirmation.changed', 'order-confirmation.deleted', 'order-confirmation.status.changed',
	'credit-note.created', 'credit-note.changed', 'credit-note.deleted', 'credit-note.status.changed',
	'delivery-note.created', 'delivery-note.changed', 'delivery-note.deleted', 'delivery-note.status.changed',
	'dunning.created', 'dunning.changed', 'dunning.deleted',
	'down-payment-invoice.created', 'down-payment-invoice.changed', 'down-payment-invoice.deleted', 'down-payment-invoice.status.changed',
	'recurring-template.created', 'recurring-template.changed', 'recurring-template.deleted',
	'payment.changed',
	'contact.created', 'contact.changed',
	'token.revoked',
] as const;
