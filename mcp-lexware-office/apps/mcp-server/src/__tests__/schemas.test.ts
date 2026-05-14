import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
	lineItemSchema,
	invoiceAddressSchema,
	invoiceSchema,
	quotationSchema,
	dunningSchema,
	TAX_TYPES,
	EVENT_TYPES,
} from '../schemas.js';

describe('lineItemSchema', () => {
	it('accepts a custom line item with all required fields', () => {
		const input = {
			type: 'custom',
			name: 'Consulting',
			quantity: 2,
			unitName: 'Stunden',
			unitPrice: { currency: 'EUR', netAmount: 100, taxRatePercentage: 19 },
			discountPercentage: 0,
		};
		expect(() => lineItemSchema.parse(input)).not.toThrow();
	});

	it('accepts a text line item', () => {
		expect(() => lineItemSchema.parse({ type: 'text', name: 'Some note' })).not.toThrow();
	});

	it('rejects unknown type', () => {
		expect(() => lineItemSchema.parse({ type: 'unknown', name: 'x' })).toThrow();
	});

	it('requires name on text items', () => {
		expect(() => lineItemSchema.parse({ type: 'text' })).toThrow();
	});

	it('rejects negative discount', () => {
		const input = {
			type: 'custom',
			name: 'x',
			quantity: 1,
			unitName: 'Stück',
			unitPrice: { currency: 'EUR', netAmount: 10, taxRatePercentage: 19 },
			discountPercentage: -5,
		};
		expect(() => lineItemSchema.parse(input)).toThrow();
	});

	it('rejects discount above 100', () => {
		const input = {
			type: 'custom',
			name: 'x',
			quantity: 1,
			unitName: 'Stück',
			unitPrice: { currency: 'EUR', netAmount: 10, taxRatePercentage: 19 },
			discountPercentage: 101,
		};
		expect(() => lineItemSchema.parse(input)).toThrow();
	});
});

describe('invoiceAddressSchema', () => {
	it('accepts contactId reference', () => {
		expect(() => invoiceAddressSchema.parse({ contactId: '123e4567-e89b-12d3-a456-426614174000' })).not.toThrow();
	});

	it('accepts inline address', () => {
		const addr = { name: 'Acme GmbH', countryCode: 'DE' };
		expect(() => invoiceAddressSchema.parse(addr)).not.toThrow();
	});

	it('rejects invalid UUID in contactId', () => {
		expect(() => invoiceAddressSchema.parse({ contactId: 'not-a-uuid' })).toThrow();
	});

	it('rejects countryCode longer than 2 chars', () => {
		expect(() => invoiceAddressSchema.parse({ name: 'Test', countryCode: 'DEU' })).toThrow();
	});
});

describe('invoiceSchema', () => {
	const validLineItem = {
		type: 'custom',
		name: 'Service',
		quantity: 1,
		unitName: 'Stunden',
		unitPrice: { currency: 'EUR', netAmount: 100, taxRatePercentage: 19 },
		discountPercentage: 0,
	};

	const baseInvoice = {
		voucherDate: '2026-04-24T00:00:00.000+02:00',
		address: { contactId: '123e4567-e89b-12d3-a456-426614174000' },
		lineItems: [validLineItem],
		taxConditions: { taxType: 'net' },
		shippingConditions: { shippingDate: '2026-04-24T00:00:00.000+02:00', shippingType: 'service' },
	};

	const schema = z.object(invoiceSchema);

	it('accepts a valid invoice payload', () => {
		expect(() => schema.parse(baseInvoice)).not.toThrow();
	});

	it('requires at least one line item', () => {
		expect(() => schema.parse({ ...baseInvoice, lineItems: [] })).toThrow();
	});

	it('rejects invalid taxType', () => {
		expect(() => schema.parse({ ...baseInvoice, taxConditions: { taxType: 'invalid' } })).toThrow();
	});

	it('accepts all 9 valid tax types', () => {
		for (const taxType of TAX_TYPES) {
			expect(() => schema.parse({ ...baseInvoice, taxConditions: { taxType } })).not.toThrow();
		}
	});

	it('enforces introduction max length 2000', () => {
		const longText = 'x'.repeat(2001);
		expect(() => schema.parse({ ...baseInvoice, introduction: longText })).toThrow();
	});

	it('enforces title max length 25', () => {
		expect(() => schema.parse({ ...baseInvoice, title: 'x'.repeat(26) })).toThrow();
	});

	it('accepts optional paymentConditions', () => {
		const withPayment = {
			...baseInvoice,
			paymentConditions: {
				paymentTermLabel: 'Zahlbar sofort',
				paymentTermDuration: 0,
			},
		};
		expect(() => schema.parse(withPayment)).not.toThrow();
	});
});

describe('quotationSchema', () => {
	it('requires expirationDate in addition to invoiceSchema fields', () => {
		const schema = z.object(quotationSchema);
		const payload = {
			voucherDate: '2026-04-24T00:00:00.000+02:00',
			address: { contactId: '123e4567-e89b-12d3-a456-426614174000' },
			lineItems: [{
				type: 'custom', name: 'x', quantity: 1, unitName: 'Stück',
				unitPrice: { currency: 'EUR', netAmount: 10, taxRatePercentage: 19 },
			}],
			taxConditions: { taxType: 'net' },
			shippingConditions: { shippingDate: '2026-04-24T00:00:00.000+02:00', shippingType: 'service' },
		};
		expect(() => schema.parse(payload)).toThrow(); // missing expirationDate
		expect(() => schema.parse({ ...payload, expirationDate: '2026-05-24T00:00:00.000+02:00' })).not.toThrow();
	});
});

describe('dunningSchema', () => {
	it('requires precedingSalesVoucherId as UUID', () => {
		const schema = z.object(dunningSchema);
		const base = {
			precedingSalesVoucherId: '123e4567-e89b-12d3-a456-426614174000',
			voucherDate: '2026-04-25T00:00:00.000+02:00',
			taxConditions: { taxType: 'net' },
			address: { contactId: '123e4567-e89b-12d3-a456-426614174000' },
			lineItems: [],
			shippingConditions: { shippingDate: '2026-04-25T00:00:00.000+02:00', shippingType: 'service' },
		};
		expect(() => schema.parse(base)).not.toThrow();
		expect(() => schema.parse({ ...base, precedingSalesVoucherId: 'not-uuid' })).toThrow();
	});

	it('accepts empty lineItems array (no dunning fee)', () => {
		const schema = z.object(dunningSchema);
		const payload = {
			precedingSalesVoucherId: '123e4567-e89b-12d3-a456-426614174000',
			voucherDate: '2026-04-25T00:00:00.000+02:00',
			taxConditions: { taxType: 'net' },
			address: { contactId: '123e4567-e89b-12d3-a456-426614174000' },
			lineItems: [],
			shippingConditions: { shippingDate: '2026-04-25T00:00:00.000+02:00', shippingType: 'service' },
		};
		expect(() => schema.parse(payload)).not.toThrow();
	});
});

describe('EVENT_TYPES', () => {
	it('includes all 38 event types', () => {
		expect(EVENT_TYPES).toHaveLength(37);
	});

	it('includes voucher and invoice lifecycle events', () => {
		expect(EVENT_TYPES).toContain('voucher.created');
		expect(EVENT_TYPES).toContain('invoice.status.changed');
		expect(EVENT_TYPES).toContain('token.revoked');
		expect(EVENT_TYPES).toContain('payment.changed');
	});
});
