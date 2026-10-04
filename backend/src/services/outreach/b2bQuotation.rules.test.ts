// Milestone 201: quotation calculation, numbering, status transition and
// email-body rules. Pure logic only: no database, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertQuotationEditable,
  assertQuotationTransition,
  buildQuotationEmail,
  canTransitionQuotation,
  computeQuotationTotals,
  formatQuotationNumber,
  parseQuantity,
  QuotationRuleError,
} from "./b2bQuotation.rules.js";

test("line totals and subtotal are exact integer cents", () => {
  const totals = computeQuotationTotals(
    [
      { unitPriceCents: 4550, quantity: 100 },
      { unitPriceCents: 1999, quantity: 3 },
    ],
    0,
    0
  );
  assert.deepEqual(totals.lineTotalsCents, [455000, 5997]);
  assert.equal(totals.subtotalCents, 460997);
  assert.equal(totals.totalCents, 460997);
});

test("discount is subtracted and delivery is added, both explicit", () => {
  const totals = computeQuotationTotals([{ unitPriceCents: 10000, quantity: 10 }], 5000, 12000);
  assert.equal(totals.subtotalCents, 100000);
  assert.equal(totals.discountCents, 5000);
  assert.equal(totals.deliveryCents, 12000);
  assert.equal(totals.totalCents, 100000 - 5000 + 12000);
});

test("zero discount and zero delivery leave the total equal to the subtotal", () => {
  const totals = computeQuotationTotals([{ unitPriceCents: 250, quantity: 4 }], 0, 0);
  assert.equal(totals.totalCents, totals.subtotalCents);
});

test("a discount equal to the whole subtotal is allowed, one cent more is not", () => {
  const ok = computeQuotationTotals([{ unitPriceCents: 1000, quantity: 1 }], 1000, 0);
  assert.equal(ok.totalCents, 0);
  assert.throws(() => computeQuotationTotals([{ unitPriceCents: 1000, quantity: 1 }], 1001, 0), QuotationRuleError);
});

test("a quotation must have at least one line", () => {
  assert.throws(() => computeQuotationTotals([], 0, 0), /at least one line/);
});

test("negative or non-integer cent amounts are refused", () => {
  assert.throws(() => computeQuotationTotals([{ unitPriceCents: 100.5, quantity: 1 }], 0, 0), QuotationRuleError);
  assert.throws(() => computeQuotationTotals([{ unitPriceCents: 100, quantity: 1 }], -1, 0), QuotationRuleError);
  assert.throws(() => computeQuotationTotals([{ unitPriceCents: 100, quantity: 1 }], 0, -1), QuotationRuleError);
});

test("an absurdly large total cannot overflow into an unsafe integer", () => {
  assert.throws(
    () => computeQuotationTotals([{ unitPriceCents: 10_000_000_000_000, quantity: 1_000 }], 0, 0),
    QuotationRuleError
  );
});

test("quantities must be whole numbers from 1 upwards", () => {
  assert.equal(parseQuantity(1), 1);
  assert.equal(parseQuantity("25"), 25);
  for (const bad of [0, -1, 1.5, "abc", "", null, undefined]) {
    assert.throws(() => parseQuantity(bad), QuotationRuleError, `expected ${String(bad)} to be rejected`);
  }
});

test("quotation numbers are SG-Q-YYYY-NNNN, zero-padded", () => {
  assert.equal(formatQuotationNumber(2026, 1), "SG-Q-2026-0001");
  assert.equal(formatQuotationNumber(2026, 42), "SG-Q-2026-0042");
  assert.equal(formatQuotationNumber(2027, 12345), "SG-Q-2027-12345");
});

test("invalid year or sequence never produces a number", () => {
  assert.throws(() => formatQuotationNumber(1999, 1), QuotationRuleError);
  assert.throws(() => formatQuotationNumber(2026, 0), QuotationRuleError);
  assert.throws(() => formatQuotationNumber(2026, 1.5), QuotationRuleError);
});

test("the quotation lifecycle allows only the documented transitions", () => {
  assert.equal(canTransitionQuotation("DRAFT", "SENT"), true);
  assert.equal(canTransitionQuotation("DRAFT", "CANCELLED"), true);
  assert.equal(canTransitionQuotation("SENT", "ACCEPTED"), true);
  assert.equal(canTransitionQuotation("SENT", "DECLINED"), true);
  assert.equal(canTransitionQuotation("SENT", "EXPIRED"), true);
  assert.equal(canTransitionQuotation("SENT", "CANCELLED"), true);

  assert.equal(canTransitionQuotation("DRAFT", "ACCEPTED"), false, "a draft was never sent, so it cannot be accepted");
  assert.equal(canTransitionQuotation("DRAFT", "DECLINED"), false);
  assert.equal(canTransitionQuotation("DRAFT", "EXPIRED"), false);
  assert.equal(canTransitionQuotation("SENT", "DRAFT"), false, "a sent quote never returns to draft");
});

test("accepted, declined, expired and cancelled quotations are terminal", () => {
  for (const terminal of ["ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"] as const) {
    for (const to of ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"] as const) {
      assert.equal(canTransitionQuotation(terminal, to), false, `${terminal} -> ${to} must be refused`);
    }
  }
});

test("an illegal transition throws a 409 conflict", () => {
  assert.throws(
    () => assertQuotationTransition("DRAFT", "ACCEPTED"),
    (error: unknown) => error instanceof QuotationRuleError && error.statusCode === 409
  );
});

test("only drafts are editable", () => {
  assert.doesNotThrow(() => assertQuotationEditable("DRAFT"));
  for (const sent of ["SENT", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"] as const) {
    assert.throws(() => assertQuotationEditable(sent), QuotationRuleError);
  }
});

test("the email body states the figures exactly and omits VAT and payment terms", () => {
  const email = buildQuotationEmail({
    quotationNumber: "SG-Q-2026-0007",
    organisationName: "Sunnyside Primary School",
    contactName: "Mrs Dlamini",
    validUntilLabel: "31 October 2026",
    lines: [{ description: "ABC Colouring Book", quantity: 100, unitPriceCents: 9900, lineTotalCents: 990000 }],
    subtotalCents: 990000,
    discountCents: 50000,
    deliveryCents: 0,
    totalCents: 940000,
    notes: null,
  });

  assert.equal(email.subject, "Quotation SG-Q-2026-0007 from Seasonedz Group");
  assert.match(email.body, /^Dear Mrs Dlamini/);
  assert.match(email.body, /100 x R99\.00 = R9,900\.00/);
  assert.match(email.body, /Discount: -R500\.00/);
  assert.match(email.body, /Total: R9,400\.00/);
  assert.doesNotMatch(email.body, /Delivery:/, "zero delivery is not printed");
  assert.doesNotMatch(email.body, /VAT/i);
  assert.doesNotMatch(email.body, /bank/i);
});

test("the email greets the organisation when no contact name is recorded", () => {
  const email = buildQuotationEmail({
    quotationNumber: "SG-Q-2026-0008",
    organisationName: "Sunnyside Primary School",
    contactName: null,
    validUntilLabel: "31 October 2026",
    lines: [{ description: "Bundle", quantity: 1, unitPriceCents: 20000, lineTotalCents: 20000 }],
    subtotalCents: 20000,
    discountCents: 0,
    deliveryCents: 12000,
    totalCents: 32000,
    notes: "Delivery to the school gate.",
  });
  assert.match(email.body, /^Dear Sunnyside Primary School/);
  assert.match(email.body, /Delivery: R120\.00/);
  assert.match(email.body, /Delivery to the school gate\./);
});
