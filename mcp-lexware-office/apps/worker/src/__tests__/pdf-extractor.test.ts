import { describe, it, expect } from 'vitest';
import { processText, parseAmount } from '../processor/pdf-extractor.js';

describe('parseAmount', () => {
  it('parses German format (1.234,56)', () => {
    expect(parseAmount('1.234,56')).toBeCloseTo(1234.56);
  });

  it('parses simple German decimal (45,90)', () => {
    expect(parseAmount('45,90')).toBeCloseTo(45.9);
  });

  it('parses international format (1,234.56)', () => {
    expect(parseAmount('1,234.56')).toBeCloseTo(1234.56);
  });

  it('parses plain decimal (458.90)', () => {
    expect(parseAmount('458.90')).toBeCloseTo(458.9);
  });
});

describe('processText — VAT ID extraction', () => {
  it('extracts DE VAT ID', () => {
    const doc = processText('Lieferant GmbH USt-IdNr. DE123456789 Berlin', 1);
    expect(doc.vatId).toBe('DE123456789');
  });

  it('returns null when no VAT ID', () => {
    const doc = processText('Keine Steuernummer vorhanden', 1);
    expect(doc.vatId).toBeNull();
  });

  it('does not match partial pattern', () => {
    const doc = processText('DE12345 is too short', 1);
    expect(doc.vatId).toBeNull();
  });
});

describe('processText — IBAN extraction', () => {
  it('extracts DE IBAN (22 chars)', () => {
    const doc = processText('IBAN: DE89370400440532013000 BIC: COBADEFFXXX', 1);
    expect(doc.iban).toBe('DE89370400440532013000');
  });

  it('returns null when no IBAN', () => {
    const doc = processText('Keine Bankverbindung', 1);
    expect(doc.iban).toBeNull();
  });
});

describe('processText — invoice number', () => {
  it('extracts Rechnungsnummer', () => {
    const doc = processText('Rechnungsnummer: RE-2026-001\nDatum: 05.04.2026', 1);
    expect(doc.invoiceNumber).toBe('RE-2026-001');
  });

  it('extracts Rechnungs-Nr.', () => {
    const doc = processText('Rechnungs-Nr.: INV/2026/042', 1);
    expect(doc.invoiceNumber).toBe('INV/2026/042');
  });

  it('returns null when absent', () => {
    const doc = processText('Kein Invoice number here', 1);
    expect(doc.invoiceNumber).toBeNull();
  });
});

describe('processText — dates', () => {
  it('extracts first date as invoiceDate, last as dueDate', () => {
    const doc = processText(
      'Rechnungsdatum: 05.04.2026\nFällig am: 05.05.2026',
      1,
    );
    expect(doc.invoiceDate).toBe('2026-04-05');
    expect(doc.dueDate).toBe('2026-05-05');
  });

  it('returns null when no dates', () => {
    const doc = processText('No date here', 1);
    expect(doc.invoiceDate).toBeNull();
  });
});

describe('processText — gross amount', () => {
  it('extracts Gesamtbetrag', () => {
    const doc = processText('Gesamtbetrag: 458,90\nDetails unten', 1);
    expect(doc.totalGrossAmount).toBeCloseTo(458.9);
  });

  it('extracts Brutto amount', () => {
    const doc = processText('Brutto 1.200,00 EUR', 1);
    expect(doc.totalGrossAmount).toBeCloseTo(1200.0);
  });

  it('returns null when absent', () => {
    const doc = processText('Nothing useful here', 1);
    expect(doc.totalGrossAmount).toBeNull();
  });
});

describe('processText — tax rows', () => {
  it('extracts 19% row', () => {
    const doc = processText('19% MwSt 385,63 73,27', 1);
    expect(doc.taxRateRows).toHaveLength(1);
    expect(doc.taxRateRows[0].rate).toBe(19);
    expect(doc.taxRateRows[0].net).toBeCloseTo(385.63);
    expect(doc.taxRateRows[0].tax).toBeCloseTo(73.27);
  });

  it('accumulates totalTaxAmount from rows', () => {
    const doc = processText('19% MwSt 385,63 73,27\n7% MwSt 100,00 7,00', 1);
    expect(doc.totalTaxAmount).toBeCloseTo(80.27);
  });
});

describe('processText — signal keywords', () => {
  it('detects lieferando signal', () => {
    const doc = processText('Lieferando Bestellungen Übersicht', 1);
    expect(doc.textSignals).toContain('lieferando');
    expect(doc.textSignals).toContain('bestellungen');
  });

  it('detects §19 signal', () => {
    const doc = processText('Kleinunternehmer gemäß §19 UStG', 1);
    expect(doc.textSignals).toContain('§19');
    expect(doc.textSignals).toContain('kleinunternehmer');
  });
});

describe('processText — boilerplate stripping', () => {
  it('strips text after AGB marker', () => {
    const text = 'Rechnung RE-001\nBetrag: 100,00\nAGB\nNur für interne Zwecke';
    const doc = processText(text, 1);
    expect(doc.cleanText).not.toContain('Nur für interne Zwecke');
    expect(doc.cleanText).toContain('Betrag: 100,00');
  });

  it('keeps full text in rawText', () => {
    const text = 'Rechnung RE-001\nAGB\nNachtext';
    const doc = processText(text, 1);
    expect(doc.rawText).toContain('Nachtext');
  });
});
