// Milestone 201: the quotation PDF must always render, even with awkward
// product names, and must print only verified business information.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { renderQuotationPdf, toPdfSafeText, wrapText, type QuotationPdfInput } from "./b2bQuotationPdf.js";
import { BUSINESS_IDENTITY } from "../../config/businessIdentity.js";

function sampleQuotation(lineCount = 2): QuotationPdfInput {
  return {
    quotationNumber: "SG-Q-2026-0007",
    quotationDate: new Date("2026-10-04T08:00:00.000Z"),
    validUntil: new Date("2026-10-31T08:00:00.000Z"),
    organisationNameSnapshot: "Sunnyside Primary School",
    contactNameSnapshot: "Mrs Dlamini",
    emailSnapshot: "office@example.co.za",
    phoneSnapshot: "012 000 0000",
    billingAddress: "12 Church Street\nPretoria",
    notes: "Delivery to the school gate. Quantities may change slightly.",
    subtotal: "9900.00",
    discountAmount: "500.00",
    deliveryAmount: "0.00",
    total: "9400.00",
    lines: Array.from({ length: lineCount }, (_, index) => ({
      position: index + 1,
      descriptionSnapshot: `ABC Colouring Book \u2013 “Edition” ${index + 1}`,
      skuSnapshot: `SG-000${index + 1}`,
      quantity: 10,
      unitPrice: "99.00",
      lineTotal: "990.00",
    })),
  };
}

test("removes or maps characters that the standard PDF fonts cannot encode", () => {
  assert.equal(toPdfSafeText("Bible \u2013 Old\u2019s \u201Cbest\u201D \u2026 \u{1F3A8}"), "Bible - Old's \"best\" ...");
  assert.equal(toPdfSafeText("line\nbreak\tand   spaces"), "line break and spaces");
});

test("wraps long text to the requested width without losing words", () => {
  const lines = wrapText("one two three four five six seven eight nine ten", 12);
  assert.ok(lines.every((line) => line.length <= 12 || !line.includes(" ")));
  assert.equal(lines.join(" "), "one two three four five six seven eight nine ten");
});

test("renders a valid single-page PDF for a normal quotation", async () => {
  const bytes = await renderQuotationPdf(sampleQuotation());
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString("ascii"), "%PDF");
  const loaded = await PDFDocument.load(bytes);
  assert.equal(loaded.getPageCount(), 1);
});

test("paginates a long quotation instead of drawing rows off the page", async () => {
  const bytes = await renderQuotationPdf(sampleQuotation(90));
  const loaded = await PDFDocument.load(bytes);
  assert.ok(loaded.getPageCount() >= 2, "90 lines must span more than one page");
});

test("renders quotations with no notes, no contact name and no discount", async () => {
  const quotation = { ...sampleQuotation(), notes: null, contactNameSnapshot: null, billingAddress: null, phoneSnapshot: null, discountAmount: "0.00" };
  const loaded = await PDFDocument.load(await renderQuotationPdf(quotation));
  assert.equal(loaded.getPageCount(), 1);
});

test("the business identity matches the owner-verified values in the frontend source", () => {
  const frontend = readFileSync(join(process.cwd(), "..", "src", "data", "businessInfo.js"), "utf8");
  const identityPath = join(process.cwd(), "src", "config", "businessIdentity.ts");
  const identity = readFileSync(identityPath, "utf8");

  const pick = (source: string, key: string) => {
    const match = source.match(new RegExp(`${key}:\\s*"([^"]+)"`));
    assert.ok(match, `${key} missing from ${source === frontend ? "businessInfo.js" : "businessIdentity.ts"}`);
    return match[1];
  };
  for (const key of ["registeredName", "registrationNumber", "email", "phoneDisplay", "websiteDisplay"]) {
    assert.equal(pick(identity, key), pick(frontend, key), `${key} drifted from businessInfo.js`);
  }
  const frontendLines = frontend.match(/registeredOfficeLines:\s*\[([^\]]+)\]/)![1]!;
  const backendLines = identity.match(/registeredOfficeLines:\s*\[([^\]]+)\]/)![1]!;
  assert.equal(backendLines.replace(/\s/g, ""), frontendLines.replace(/\s/g, ""));
});

test("the PDF identity block never prints VAT, bank or payment-term wording", () => {
  const printed = Object.values(BUSINESS_IDENTITY).flat().join(" ");
  assert.doesNotMatch(printed, /vat|bank|payment terms/i);
});
