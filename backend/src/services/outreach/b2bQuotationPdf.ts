// Milestone 201: printable quotation PDF, rendered server-side with pdf-lib
// (already a backend dependency). Uses only verified business identity
// (config/businessIdentity.ts) and the quotation's own snapshotted figures.
// Prints no VAT, bank details or payment terms, since none is verified.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { BUSINESS_IDENTITY } from "../../config/businessIdentity.js";
import { formatRand, parseMoneyToCents } from "../../utils/quotationMoney.js";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const TABLE_BOTTOM = 120;
const RIGHT_EDGE = PAGE_WIDTH - MARGIN;
const ROW_HEIGHT = 16;

const PUNCTUATION_MAP: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  " ": " ",
};

// Standard PDF fonts only encode WinAnsi. Map common typographic characters
// to ASCII and drop anything else, so a stray character can never make the
// PDF fail to render.
export function toPdfSafeText(value: string): string {
  let mapped = value;
  for (const [from, to] of Object.entries(PUNCTUATION_MAP)) mapped = mapped.split(from).join(to);
  return mapped.replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7E¡-ÿ]/g, "").replace(/\s{2,}/g, " ").trim();
}

export function wrapText(value: string, maxChars: number): string[] {
  const words = toPdfSafeText(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface QuotationPdfLine {
  position: number;
  descriptionSnapshot: string;
  skuSnapshot: string | null;
  quantity: number;
  unitPrice: { toString(): string } | string;
  lineTotal: { toString(): string } | string;
}

export interface QuotationPdfInput {
  quotationNumber: string;
  quotationDate: Date;
  validUntil: Date;
  organisationNameSnapshot: string;
  contactNameSnapshot: string | null;
  emailSnapshot: string;
  phoneSnapshot: string | null;
  billingAddress: string | null;
  notes: string | null;
  subtotal: { toString(): string } | string;
  discountAmount: { toString(): string } | string;
  deliveryAmount: { toString(): string } | string;
  total: { toString(): string } | string;
  lines: QuotationPdfLine[];
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "long" });

function cents(value: { toString(): string } | string): number {
  return parseMoneyToCents(String(value), "Amount");
}

interface DrawContext {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  page: PDFPage;
  y: number;
}

function drawText(ctx: DrawContext, text: string, x: number, size: number, options: { bold?: boolean; alignRight?: boolean } = {}) {
  const font = options.bold ? ctx.bold : ctx.font;
  const safe = toPdfSafeText(text);
  const width = font.widthOfTextAtSize(safe, size);
  const drawX = options.alignRight ? x - width : x;
  ctx.page.drawText(safe, { x: drawX, y: ctx.y, size, font, color: rgb(0.1, 0.1, 0.1) });
}

function newPage(ctx: DrawContext) {
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
}

function drawTableHeader(ctx: DrawContext) {
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 4, width: RIGHT_EDGE - MARGIN, height: ROW_HEIGHT, color: rgb(0.93, 0.93, 0.93) });
  drawText(ctx, "#", MARGIN + 4, 9, { bold: true });
  drawText(ctx, "Description", MARGIN + 24, 9, { bold: true });
  drawText(ctx, "SKU", 330, 9, { bold: true });
  drawText(ctx, "Qty", 430, 9, { bold: true, alignRight: true });
  drawText(ctx, "Unit price", 490, 9, { bold: true, alignRight: true });
  drawText(ctx, "Line total", RIGHT_EDGE - 4, 9, { bold: true, alignRight: true });
  ctx.y -= ROW_HEIGHT + 4;
}

export async function renderQuotationPdf(input: QuotationPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const ctx: DrawContext = { doc, font, bold, page, y: PAGE_HEIGHT - MARGIN };

  drawText(ctx, BUSINESS_IDENTITY.registeredName, MARGIN, 18, { bold: true });
  ctx.y -= 16;
  drawText(ctx, `Registration number ${BUSINESS_IDENTITY.registrationNumber}`, MARGIN, 9);
  ctx.y -= 12;
  drawText(ctx, BUSINESS_IDENTITY.registeredOfficeLines.join(", "), MARGIN, 9);
  ctx.y -= 12;
  drawText(ctx, `${BUSINESS_IDENTITY.email}  |  ${BUSINESS_IDENTITY.phoneDisplay}  |  ${BUSINESS_IDENTITY.websiteDisplay}`, MARGIN, 9);

  const headerTop = PAGE_HEIGHT - MARGIN;
  ctx.y = headerTop;
  drawText(ctx, "QUOTATION", RIGHT_EDGE, 20, { bold: true, alignRight: true });
  ctx.y -= 18;
  drawText(ctx, `Number: ${input.quotationNumber}`, RIGHT_EDGE, 10, { alignRight: true });
  ctx.y -= 14;
  drawText(ctx, `Date: ${DATE_FORMAT.format(input.quotationDate)}`, RIGHT_EDGE, 10, { alignRight: true });
  ctx.y -= 14;
  drawText(ctx, `Valid until: ${DATE_FORMAT.format(input.validUntil)}`, RIGHT_EDGE, 10, { alignRight: true });

  ctx.y = PAGE_HEIGHT - 150;
  page.drawLine({ start: { x: MARGIN, y: ctx.y + 8 }, end: { x: RIGHT_EDGE, y: ctx.y + 8 }, thickness: 0.7, color: rgb(0.7, 0.7, 0.7) });
  drawText(ctx, "Prepared for", MARGIN, 11, { bold: true });
  ctx.y -= 16;
  drawText(ctx, input.organisationNameSnapshot, MARGIN, 10);
  if (input.contactNameSnapshot) {
    ctx.y -= 13;
    drawText(ctx, input.contactNameSnapshot, MARGIN, 10);
  }
  ctx.y -= 13;
  drawText(ctx, input.emailSnapshot, MARGIN, 10);
  if (input.phoneSnapshot) {
    ctx.y -= 13;
    drawText(ctx, input.phoneSnapshot, MARGIN, 10);
  }
  if (input.billingAddress) {
    for (const line of wrapText(input.billingAddress, 70)) {
      ctx.y -= 13;
      drawText(ctx, line, MARGIN, 10);
    }
  }

  ctx.y -= 30;
  drawTableHeader(ctx);

  for (const line of input.lines) {
    if (ctx.y < TABLE_BOTTOM) {
      newPage(ctx);
      drawTableHeader(ctx);
    }
    const description = wrapText(line.descriptionSnapshot, 52)[0] ?? "";
    drawText(ctx, String(line.position), MARGIN + 4, 9);
    drawText(ctx, description, MARGIN + 24, 9);
    drawText(ctx, line.skuSnapshot ?? "", 330, 9);
    drawText(ctx, String(line.quantity), 430, 9, { alignRight: true });
    drawText(ctx, formatRand(cents(line.unitPrice)), 490, 9, { alignRight: true });
    drawText(ctx, formatRand(cents(line.lineTotal)), RIGHT_EDGE - 4, 9, { alignRight: true });
    ctx.y -= ROW_HEIGHT;
  }

  if (ctx.y < TABLE_BOTTOM + 90) newPage(ctx);
  ctx.y -= 14;
  const totalsRows: [string, number, boolean][] = [["Subtotal", cents(input.subtotal), false]];
  if (cents(input.discountAmount) > 0) totalsRows.push(["Discount", cents(input.discountAmount), false]);
  if (cents(input.deliveryAmount) > 0) totalsRows.push(["Delivery", cents(input.deliveryAmount), false]);
  totalsRows.push(["Total", cents(input.total), true]);

  for (const [label, value, isTotal] of totalsRows) {
    drawText(ctx, label, 430, 10, { bold: isTotal, alignRight: true });
    drawText(ctx, formatRand(value), RIGHT_EDGE - 4, 10, { bold: isTotal, alignRight: true });
    ctx.y -= 16;
  }

  if (input.notes) {
    ctx.y -= 10;
    if (ctx.y < TABLE_BOTTOM) newPage(ctx);
    drawText(ctx, "Notes", MARGIN, 10, { bold: true });
    for (const line of wrapText(input.notes, 100)) {
      ctx.y -= 13;
      if (ctx.y < TABLE_BOTTOM) newPage(ctx);
      drawText(ctx, line, MARGIN, 10);
    }
  }

  const pages = doc.getPages();
  pages.forEach((pdfPage, index) => {
    const footer = `Prices in South African Rand (ZAR). Page ${index + 1} of ${pages.length}.`;
    pdfPage.drawText(toPdfSafeText(footer), { x: MARGIN, y: 35, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  });

  return doc.save();
}
