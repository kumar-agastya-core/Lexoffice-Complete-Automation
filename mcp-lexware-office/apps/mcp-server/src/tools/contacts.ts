import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeLexwareOfficeRequest, makeLexwareOfficeWriteRequest, makeLexwareOfficeWriteWithRetry } from '../helper.js';
import { writeErrorResponse, trim } from '../utils.js';

export function registerContactTools(server: McpServer): void {
	server.tool(
		'get-contacts',
		'Get contacts. API caps at 25/page. Use fetchAll=true for all contacts.',
		{
			email: z.string().min(3).optional().describe('Substring; % wildcard OK'),
			name: z.string().min(3).optional().describe('Substring; % wildcard OK'),
			number: z.number().int().optional(),
			customer: z.boolean().optional().describe('true = has customer role'),
			vendor: z.boolean().optional().describe('true = has vendor role'),
			page: z.number().min(0).optional().default(0),
			size: z.number().min(1).max(250).optional().default(25).describe('Max 25 (API cap)'),
			fetchAll: z.boolean().optional().default(false).describe('Fetch all pages'),
		},
		async ({ email, name, number, customer, vendor, page, size, fetchAll }) => {
			const baseParams = new URLSearchParams();
			if (email) baseParams.append('email', email);
			if (name) baseParams.append('name', name);
			if (number) baseParams.append('number', number.toString());
			if (customer !== undefined) baseParams.append('customer', customer.toString());
			if (vendor !== undefined) baseParams.append('vendor', vendor.toString());

			if (!fetchAll) {
				baseParams.append('page', String(page));
				baseParams.append('size', String(size));
				const data = await makeLexwareOfficeRequest<any>(`/v1/contacts?${baseParams.toString()}`);
				if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve contacts' }] };
				const contacts = (data.content ?? data).map((c: unknown) => trim('contact', c));
				return {
					content: [{
						type: 'text',
						text: `Contacts (page ${page}, ${contacts.length} of ${data.totalElements ?? contacts.length} total):\n\n${JSON.stringify(contacts, null, 2)}`,
					}],
				};
			}

			const allContacts: unknown[] = [];
			let currentPage = 0;
			let isLast = false;
			while (!isLast) {
				const params = new URLSearchParams(baseParams);
				params.append('page', String(currentPage));
				params.append('size', '25');
				const data = await makeLexwareOfficeRequest<any>(`/v1/contacts?${params.toString()}`);
				if (!data) return { content: [{ type: 'text', text: `Failed on page ${currentPage}` }] };
				allContacts.push(...(data.content ?? []).map((c: unknown) => trim('contact', c)));
				isLast = data.last ?? true;
				currentPage++;
				if (!isLast) await new Promise(r => setTimeout(r, 1100));
			}
			return {
				content: [{
					type: 'text',
					text: `All contacts (${allContacts.length} total, ${currentPage} pages):\n\n${JSON.stringify({ contacts: allContacts, totalFetched: allContacts.length }, null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'get-contact-by-id',
		'Get a contact by UUID.',
		{ id: z.string().uuid() },
		async ({ id }) => {
			const data = await makeLexwareOfficeRequest<any>(`/v1/contacts/${id}`);
			if (!data) return { content: [{ type: 'text', text: `Failed to retrieve contact ${id}` }] };
			return { content: [{ type: 'text', text: `Contact details:\n\n${JSON.stringify(trim('contact', data), null, 2)}` }] };
		},
	);

	server.tool(
		'find-contact',
		'Search contacts by name or email. Returns all matches — never auto-selects.',
		{
			name: z.string().optional().describe('Substring; % wildcard OK'),
			email: z.string().optional().describe('Substring; % wildcard OK'),
		},
		async ({ name, email }) => {
			if (!name && !email) {
				return { content: [{ type: 'text', text: 'Provide at least name or email.' }] };
			}
			const params = new URLSearchParams({ size: '25', page: '0' });
			if (name) params.append('name', name);
			if (email) params.append('email', email);
			const data = await makeLexwareOfficeRequest<any>(`/v1/contacts?${params.toString()}`);
			if (!data) return { content: [{ type: 'text', text: 'Failed to search contacts' }] };
			const contacts = (data.content ?? []).map((c: unknown) => trim('contact', c));
			if (contacts.length === 0) return { content: [{ type: 'text', text: 'No contacts found.' }] };
			return {
				content: [{
					type: 'text',
					text: `Found ${contacts.length} contact(s):\n\n${JSON.stringify(contacts, null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'find-or-create-contact',
		'Find a contact by name/email. 0 matches → create. 1 match → return. 2+ matches → return all (no auto-select).',
		{
			name: z.string().optional().describe('Substring; % wildcard OK'),
			email: z.string().optional().describe('Substring; % wildcard OK'),
			customer: z.string().optional().transform(v => v === 'true').describe('"true" = customer role'),
			vendor: z.string().optional().transform(v => v === 'true').describe('"true" = vendor role'),
			companyName: z.string().optional(),
			firstName: z.string().optional(),
			lastName: z.string().optional(),
			salutation: z.string().optional().describe('Herr/Frau'),
			billingStreet: z.string().optional(),
			billingZip: z.string().optional(),
			billingCity: z.string().optional(),
			billingCountryCode: z.string().length(2).optional().describe('ISO 3166-1 alpha-2'),
			emailBusiness: z.string().optional(),
			phoneBusiness: z.string().optional(),
		},
		async ({ name, email, customer, vendor, companyName, firstName, lastName, salutation,
			billingStreet, billingZip, billingCity, billingCountryCode, emailBusiness, phoneBusiness }) => {
			const params = new URLSearchParams({ size: '25', page: '0' });
			if (name) params.append('name', name);
			if (email) params.append('email', email);
			const data = await makeLexwareOfficeRequest<any>(`/v1/contacts?${params.toString()}`);
			if (!data) return { content: [{ type: 'text', text: 'Failed to search contacts' }] };
			const contacts = data.content ?? [];

			if (contacts.length > 1) {
				return {
					content: [{
						type: 'text',
						text: `Ambiguous — ${contacts.length} matches found. Specify the exact contact ID:\n\n${JSON.stringify(contacts.map((c: unknown) => trim('contact', c)), null, 2)}`,
					}],
				};
			}

			if (contacts.length === 1) {
				return {
					content: [{
						type: 'text',
						text: `Existing contact found:\n\n${JSON.stringify(trim('contact', contacts[0]), null, 2)}`,
					}],
				};
			}

			// 0 matches — create
			const hasBillingAddress = billingStreet || billingZip || billingCity || billingCountryCode;
			const contactPersons = companyName && (firstName || lastName)
				? [{ ...(salutation ? { salutation } : {}), ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}), primary: true }]
				: undefined;

			const result = await makeLexwareOfficeWriteRequest<any>('/v1/contacts', 'POST', {
				version: 0,
				roles: {
					...(customer ? { customer: {} } : {}),
					...(vendor ? { vendor: {} } : {}),
				},
				...(companyName ? {
					company: {
						name: companyName,
						...(contactPersons ? { contactPersons } : {}),
					},
				} : {}),
				...(!companyName && (lastName || firstName) ? {
					person: { ...(salutation ? { salutation } : {}), ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) },
				} : {}),
				...(hasBillingAddress ? {
					addresses: {
						billing: [{
							...(billingStreet ? { street: billingStreet } : {}),
							...(billingZip ? { zip: billingZip } : {}),
							...(billingCity ? { city: billingCity } : {}),
							...(billingCountryCode ? { countryCode: billingCountryCode } : {}),
						}],
					},
				} : {}),
				...(emailBusiness ? { emailAddresses: { business: [emailBusiness] } } : {}),
				...(phoneBusiness ? { phoneNumbers: { business: [phoneBusiness] } } : {}),
			});

			if (!result || !result.ok) {
				return { content: [{ type: 'text', text: writeErrorResponse(result && !result.ok ? result : null) }] };
			}
			const id = (result.data as any)?.id ?? '';
			return {
				content: [{
					type: 'text',
					text: `Contact created:\nhttps://app.lexware.de/permalink/contacts/view/${id}\n\n${JSON.stringify(trim('contact', result.data), null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'create-contact',
		'Create a contact. companyName for company, firstName/lastName for person.',
		{
			customer: z.string().optional().transform(v => v === 'true').describe('"true" = customer role'),
			vendor: z.string().optional().transform(v => v === 'true').describe('"true" = vendor role'),
			companyName: z.string().optional(),
			taxNumber: z.string().optional(),
			vatRegistrationId: z.string().optional().describe('VAT ID'),
			allowTaxFreeInvoices: z.boolean().optional().describe('§19 UStG Kleinunternehmer'),
			firstName: z.string().optional(),
			lastName: z.string().optional(),
			salutation: z.string().optional().describe('Herr/Frau'),
			billingStreet: z.string().optional(),
			billingZip: z.string().optional(),
			billingCity: z.string().optional(),
			billingCountryCode: z.string().length(2).optional().describe('ISO 3166-1 alpha-2'),
			emailBusiness: z.string().optional(),
			phoneBusiness: z.string().optional(),
			note: z.string().optional(),
		},
		async ({ customer, vendor, companyName, taxNumber, vatRegistrationId, allowTaxFreeInvoices,
			firstName, lastName, salutation, billingStreet, billingZip, billingCity,
			billingCountryCode, emailBusiness, phoneBusiness, note }) => {
			const hasBillingAddress = billingStreet || billingZip || billingCity || billingCountryCode;
			const contactPersons = companyName && (firstName || lastName)
				? [{ ...(salutation ? { salutation } : {}), ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}), primary: true }]
				: undefined;

			const result = await makeLexwareOfficeWriteRequest<any>('/v1/contacts', 'POST', {
				version: 0,
				roles: {
					...(customer ? { customer: {} } : {}),
					...(vendor ? { vendor: {} } : {}),
				},
				...(companyName ? {
					company: {
						name: companyName,
						...(taxNumber ? { taxNumber } : {}),
						...(vatRegistrationId ? { vatRegistrationId } : {}),
						...(allowTaxFreeInvoices !== undefined ? { allowTaxFreeInvoices } : {}),
						...(contactPersons ? { contactPersons } : {}),
					},
				} : {}),
				...(!companyName && (lastName || firstName) ? {
					person: { ...(salutation ? { salutation } : {}), ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) },
				} : {}),
				...(hasBillingAddress ? {
					addresses: {
						billing: [{
							...(billingStreet ? { street: billingStreet } : {}),
							...(billingZip ? { zip: billingZip } : {}),
							...(billingCity ? { city: billingCity } : {}),
							...(billingCountryCode ? { countryCode: billingCountryCode } : {}),
						}],
					},
				} : {}),
				...(emailBusiness ? { emailAddresses: { business: [emailBusiness] } } : {}),
				...(phoneBusiness ? { phoneNumbers: { business: [phoneBusiness] } } : {}),
				...(note ? { note } : {}),
			});

			if (!result || !result.ok) {
				return { content: [{ type: 'text', text: writeErrorResponse(result && !result.ok ? result : null) }] };
			}
			const id = (result.data as any)?.id ?? '';
			return {
				content: [{
					type: 'text',
					text: `Contact created:\nhttps://app.lexware.de/permalink/contacts/view/${id}\n\n${JSON.stringify(trim('contact', result.data), null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'update-contact',
		'Update a contact. On 409 conflict auto-fetches and retries once.',
		{
			id: z.string().uuid(),
			version: z.number().int().describe('From get-contact-by-id'),
			customer: z.string().optional().transform(v => v === 'true'),
			vendor: z.string().optional().transform(v => v === 'true'),
			companyName: z.string().optional(),
			taxNumber: z.string().optional(),
			vatRegistrationId: z.string().optional(),
			firstName: z.string().optional(),
			lastName: z.string().optional(),
			salutation: z.string().optional(),
			note: z.string().optional(),
		},
		async ({ id, customer, vendor, companyName, taxNumber, vatRegistrationId, firstName, lastName, salutation, note, version }) => {
			if (!customer && !vendor) {
				return { content: [{ type: 'text', text: 'Error: at least one role (customer or vendor) must be set to "true".' }] };
			}
			const payload = {
				version,
				roles: {
					...(customer ? { customer: {} } : {}),
					...(vendor ? { vendor: {} } : {}),
				},
				...(companyName ? {
					company: { name: companyName, ...(taxNumber ? { taxNumber } : {}), ...(vatRegistrationId ? { vatRegistrationId } : {}) },
				} : {}),
				...(lastName || firstName ? {
					person: { ...(salutation ? { salutation } : {}), ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) },
				} : {}),
				...(note ? { note } : {}),
			};

			const result = await makeLexwareOfficeWriteWithRetry<any>(
				`/v1/contacts/${id}`,
				'PUT',
				payload,
				async () => makeLexwareOfficeRequest<any>(`/v1/contacts/${id}`),
			);

			if (!result || !result.ok) {
				return { content: [{ type: 'text', text: writeErrorResponse(result && !result.ok ? result : null) }] };
			}
			return { content: [{ type: 'text', text: `Contact updated:\n\n${JSON.stringify(trim('contact', result.data), null, 2)}` }] };
		},
	);
}
