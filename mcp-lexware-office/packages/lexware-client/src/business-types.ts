export const BUSINESS_TYPES = [
  {
    id: 'gastronomy' as const,
    label: 'Restaurant / Café / Bar',
    lens: 'Gastronomy / Food & Beverage',
    hints: {
      foodVatRate: 7,
      dineInVatRate: 19,
      deliveryPlatforms: ['lieferando', 'ubereats', 'deliveroo'] as string[],
      rawMaterialsCategory: 'Wareneingang',
      entertainmentCategory: null as string | null,
    },
  },
  {
    id: 'retail' as const,
    label: 'Retail / Shop / E-Commerce',
    lens: 'Retail / Product Sales',
    hints: {
      goodsVatRate: 19,
      deliveryPlatforms: ['amazon', 'ebay'] as string[],
      inventoryCategory: 'Wareneingang',
    },
  },
  {
    id: 'it_consulting' as const,
    label: 'IT / Software / Consulting',
    lens: 'Professional Services / IT Consulting',
    hints: {
      servicesVatRate: 19,
      softwareLicensesCategory: 'EDV-Kosten',
      entertainmentCategory: 'Bewirtungskosten',
    },
  },
  {
    id: 'construction' as const,
    label: 'Construction / Trades / Handwerk',
    lens: 'Construction / Skilled Trades',
    hints: {
      servicesVatRate: 19,
      reverseChargeExpected: true,
      materialsCategory: 'Material/Waren',
    },
  },
  {
    id: 'other' as const,
    label: 'Other Business',
    lens: 'General Business',
    hints: {} as Record<string, unknown>,
  },
] as const;

export type BusinessTypeId = (typeof BUSINESS_TYPES)[number]['id'];

export function getBusinessType(id: BusinessTypeId) {
  return BUSINESS_TYPES.find((b) => b.id === id);
}
