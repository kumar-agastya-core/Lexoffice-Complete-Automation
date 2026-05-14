import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Disable Web Worker in Node environment
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = '';

export interface ExtractedDocument {
  rawText: string;
  cleanText: string;
  vatId: string | null;
  iban: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  totalGrossAmount: number | null;
  totalTaxAmount: number | null;
  taxRateRows: Array<{ rate: number; net: number; tax: number; gross: number }>;
  pageCount: number;
  textSignals: string[];
}

const BOILERPLATE_MARKERS = [
  'agb',
  'datenschutz',
  'handelsregister',
  'sepa lastschrift',
  'bankverbindung',
  'haftungsausschluss',
  'allgemeine geschäftsbedingungen',
];

const SIGNAL_KEYWORDS = [
  'gutschrift', 'auszahlung', 'servicegebühr', 'umsatzübersicht', 'kassenbuch',
  'darlehensabzüge', 'sofortfinanzierung', 'bestellungen', 'lieferando', 'takeaway',
  '§19', 'kleinunternehmer', '§13b', 'bauleistung', 'innergemeinschaftlich',
  'ec-karte', 'bar', 'rechnung', 'invoice',
];

/** Parse pages via pdfjs — returns raw concatenated text and page count. */
async function parsePages(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const data = new Uint8Array(buffer);
  const loadingTask = (pdfjsLib as any).getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  const pageCount: number = pdf.numPages;
  const lines: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = (content.items as Array<{ str?: string }>)
      .map((item) => item.str ?? '')
      .join(' ');
    lines.push(pageText);
  }

  return { text: lines.join('\n'), pageCount };
}

/** Strip lines containing boilerplate markers. */
function stripBoilerplate(text: string): string {
  const inputLines = text.split('\n');
  const out: string[] = [];
  for (const line of inputLines) {
    const lower = line.toLowerCase();
    if (BOILERPLATE_MARKERS.some((m) => lower.includes(m))) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

/** Parse German (1.234,56) or international (1,234.56) number string to float. */
export function parseAmount(raw: string): number {
  const s = raw.trim();
  // German format: dot = thousands sep, comma = decimal
  if (/^\d{1,3}(\.\d{3})*(,\d{2})$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  // International format: comma = thousands sep, dot = decimal
  return parseFloat(s.replace(/,/g, ''));
}

/** Extract all structured fields from raw text — pure function, testable. */
export function processText(rawText: string, pageCount: number): ExtractedDocument {
  const cleanText = stripBoilerplate(rawText);

  // VAT ID
  const vatIdMatch = rawText.match(/\bDE\d{9}\b/);
  const vatId = vatIdMatch ? vatIdMatch[0] : null;

  // IBAN
  const ibanMatch = rawText.match(/\bDE\d{20}\b/);
  const iban = ibanMatch ? ibanMatch[0] : null;

  // Invoice number
  const invNumMatch = rawText.match(
    /(?:Rechnungs?(?:nummer|-?nr\.?)|Rechnung\s*Nr\.?|Invoice\s*No\.?)[:\s]*([\w\-\/]{3,30})/i,
  );
  const invoiceNumber = invNumMatch ? invNumMatch[1].trim() : null;

  // Dates — collect all dd.mm.yyyy or dd/mm/yyyy
  const dateRegex = /(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/g;
  const dates: string[] = [];
  let dm: RegExpExecArray | null;
  while ((dm = dateRegex.exec(rawText)) !== null) {
    const day = dm[1].padStart(2, '0');
    const month = dm[2].padStart(2, '0');
    const rawYear = dm[3];
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    dates.push(`${year}-${month}-${day}`);
  }
  const invoiceDate = dates.length > 0 ? dates[0] : null;
  const dueDate = dates.length > 1 ? dates[dates.length - 1] : null;

  // Gross total — handles German thousands sep (1.234,56) and plain (1234,56 or 1234.56)
  const totalMatch = rawText.match(
    /(?:Gesamt|Total|Brutto|Rechnungsbetrag)[^\d]{0,20}(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,6},\d{2}|\d{1,6}\.\d{2})/i,
  );
  const totalGrossAmount = totalMatch ? parseAmount(totalMatch[1]) : null;

  // Tax rows  (\d+%) net tax gross
  const taxRowRegex =
    /(\d+(?:\.\d+)?)\s*%[^\d]{0,20}(\d{1,6}[,.]\d{2})[^\d]{0,20}(\d{1,6}[,.]\d{2})/g;
  const taxRateRows: ExtractedDocument['taxRateRows'] = [];
  let tr: RegExpExecArray | null;
  while ((tr = taxRowRegex.exec(rawText)) !== null) {
    const rate = parseFloat(tr[1]);
    const net = parseAmount(tr[2]);
    const tax = parseAmount(tr[3]);
    taxRateRows.push({ rate, net, tax, gross: net + tax });
  }

  // Tax amount from rows
  const totalTaxAmount =
    taxRateRows.length > 0
      ? parseFloat(taxRateRows.reduce((s, r) => s + r.tax, 0).toFixed(2))
      : null;

  // Signal keywords
  const lowerText = rawText.toLowerCase();
  const textSignals = SIGNAL_KEYWORDS.filter((kw) => lowerText.includes(kw));

  return {
    rawText,
    cleanText,
    vatId,
    iban,
    invoiceNumber,
    invoiceDate,
    dueDate,
    totalGrossAmount,
    totalTaxAmount,
    taxRateRows,
    pageCount,
    textSignals,
  };
}

/** Full extraction: parse PDF buffer → return structured document. */
export async function extractPdfText(buffer: Buffer): Promise<ExtractedDocument> {
  const { text, pageCount } = await parsePages(buffer);
  return processText(text, pageCount);
}
