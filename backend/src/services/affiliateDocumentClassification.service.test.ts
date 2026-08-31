// Synthetic, fictional document text fixtures only — brief section 56:
// "NEVER use real customer IDs/passports/bank statements in repository
// tests." Every string below is hand-written filler text, never copied
// from or resembling a genuine document.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyDocumentType, matchExtractedData } from "./affiliateDocumentClassification.service.js";

const SYNTHETIC_BANK_STATEMENT = `
Capitec Bank Limited, Authorised Financial Services Provider.
Account Statement
Account Holder: Jane Smith
Account Number: 1234567890
Statement Period: 01 January 2026 - 31 January 2026
Opening Balance: R 1 000.00
Closing Balance: R 1 250.00
Transaction History:
01/01/2026 Debit R100.00 Balance R900.00
15/01/2026 Credit R450.00 Balance R1350.00
`;

const SYNTHETIC_MUNICIPAL_LETTER = `
City of Tshwane Metropolitan Municipality
Municipal Account Statement
Account Number: 987654321
Property Address: 12 Oak Road, Sunnyside, Pretoria, 0002
Rates and Taxes for the period ending 31 January 2026.
`;

const SYNTHETIC_SA_ID_TEXT = `
REPUBLIC OF SOUTH AFRICA
IDENTITY DOCUMENT
Identity Number: 9001015008088
Surname: Smith
Names: Jane
Smart ID Card issued by the Department of Home Affairs.
`;

const SYNTHETIC_PASSPORT_TEXT = `
PASSPORT
Type: P  Country Code: RSA
Passport No: A1234567
Surname: Smith  Given Names: Jane
Nationality: South African
Date of Issue: 01 Jan 2020  Date of Expiry: 01 Jan 2030
P<RSASMITH<<JANE<<<<<<<<<<<<<<<<<<<<<<<<<<<
`;

// Milestone 178: deliberately no "statement"/"transaction"/"debit"/
// "credit" wording — a confirmation letter is a short letter, not a
// transaction record, which is exactly the distinction the new
// BANKING_CONFIRMATION_LETTER category set is designed to notice.
const SYNTHETIC_BANKING_CONFIRMATION_LETTER = `
Standard Bank of South Africa Limited, Authorised Financial Services Provider.
To Whom It May Concern
This letter serves as confirmation of account details held with us.
Account Holder: Jane Smith
Account Number: 1234567890
Account Type: Cheque Account
Branch Name: Sunnyside Branch
Branch Code: 051001
`;

const SYNTHETIC_INVOICE = `
Tax Invoice #INV-2026-0042
Bill To: Jane Smith
Item: Colouring Book x2
Total Due: R150.00
Thank you for your business.
`;

test("classifyDocumentType: a genuine-looking bank statement classifies as MATCH", () => {
  const result = classifyDocumentType("BANK_STATEMENT", SYNTHETIC_BANK_STATEMENT);
  assert.equal(result.result, "MATCH");
});

test("classifyDocumentType: an ID uploaded when Bank Statement was selected is a MISMATCH (brief section 20 example)", () => {
  const result = classifyDocumentType("BANK_STATEMENT", SYNTHETIC_SA_ID_TEXT);
  assert.equal(result.result, "MISMATCH");
  assert.match(result.reason, /does not appear to be a bank statement/);
});

test("classifyDocumentType: a passport uploaded when Bank Statement was selected is a MISMATCH", () => {
  const result = classifyDocumentType("BANK_STATEMENT", SYNTHETIC_PASSPORT_TEXT);
  assert.equal(result.result, "MISMATCH");
});

test("classifyDocumentType: a municipal letter uploaded when Bank Statement was selected is a MISMATCH", () => {
  const result = classifyDocumentType("BANK_STATEMENT", SYNTHETIC_MUNICIPAL_LETTER);
  assert.equal(result.result, "MISMATCH");
});

test("classifyDocumentType: a genuinely inconclusive document (invoice) is MANUAL_REVIEW, never a false MISMATCH (brief section 24)", () => {
  const result = classifyDocumentType("BANK_STATEMENT", SYNTHETIC_INVOICE);
  assert.equal(result.result, "MANUAL_REVIEW");
});

test("classifyDocumentType: a genuine-looking municipal document classifies as MATCH", () => {
  const result = classifyDocumentType("MUNICIPAL_ACCOUNT_OR_LETTER", SYNTHETIC_MUNICIPAL_LETTER);
  assert.equal(result.result, "MATCH");
});

test("classifyDocumentType: a bank statement uploaded when Municipal was selected is a MISMATCH", () => {
  const result = classifyDocumentType("MUNICIPAL_ACCOUNT_OR_LETTER", SYNTHETIC_BANK_STATEMENT);
  assert.equal(result.result, "MISMATCH");
});

test("classifyDocumentType: an ID-shaped document classifies as MATCH", () => {
  const result = classifyDocumentType("SA_ID", SYNTHETIC_SA_ID_TEXT);
  assert.equal(result.result, "MATCH");
});

test("classifyDocumentType: never claims Home Affairs verification in its own reason text", () => {
  const result = classifyDocumentType("SA_ID", SYNTHETIC_SA_ID_TEXT);
  assert.doesNotMatch(result.reason.toLowerCase(), /verified by home affairs|confirmed by home affairs|government verified/);
});

test("classifyDocumentType: a passport-shaped document classifies as MATCH", () => {
  const result = classifyDocumentType("PASSPORT", SYNTHETIC_PASSPORT_TEXT);
  assert.equal(result.result, "MATCH");
});

test("classifyDocumentType: an SA ID uploaded when Passport was selected is a MISMATCH", () => {
  const result = classifyDocumentType("PASSPORT", SYNTHETIC_SA_ID_TEXT);
  assert.equal(result.result, "MISMATCH");
});

test("classifyDocumentType: no extractable text (e.g. a photo) is honestly MANUAL_REVIEW, never a guess", () => {
  const result = classifyDocumentType("BANK_STATEMENT", null);
  assert.equal(result.result, "MANUAL_REVIEW");
  assert.match(result.reason, /not available/i);
});

test("classifyDocumentType: an unsupported/unreadable document (empty text) is MANUAL_REVIEW", () => {
  const result = classifyDocumentType("SA_ID", "   ");
  assert.equal(result.result, "MANUAL_REVIEW");
});

// Milestone 178, brief section 12/19: replaces IDENTITY/PROOF_OF_
// RESIDENCE as the only document a new affiliate application requires.
test("classifyDocumentType: a genuine-looking banking confirmation letter classifies as MATCH", () => {
  const result = classifyDocumentType("BANKING_CONFIRMATION_LETTER", SYNTHETIC_BANKING_CONFIRMATION_LETTER);
  assert.equal(result.result, "MATCH");
});

test("classifyDocumentType: an SA ID uploaded when Banking Confirmation Letter was selected is a MISMATCH", () => {
  const result = classifyDocumentType("BANKING_CONFIRMATION_LETTER", SYNTHETIC_SA_ID_TEXT);
  assert.equal(result.result, "MISMATCH");
  assert.match(result.reason, /does not appear to be a banking confirmation letter/);
});

test("classifyDocumentType: a passport uploaded when Banking Confirmation Letter was selected is a MISMATCH", () => {
  const result = classifyDocumentType("BANKING_CONFIRMATION_LETTER", SYNTHETIC_PASSPORT_TEXT);
  assert.equal(result.result, "MISMATCH");
});

test("classifyDocumentType: a municipal letter uploaded when Banking Confirmation Letter was selected is a MISMATCH", () => {
  const result = classifyDocumentType("BANKING_CONFIRMATION_LETTER", SYNTHETIC_MUNICIPAL_LETTER);
  assert.equal(result.result, "MISMATCH");
});

test("classifyDocumentType: a full bank statement (with transaction history) uploaded when Banking Confirmation Letter was selected is a MISMATCH — a statement and a confirmation letter are different documents", () => {
  const result = classifyDocumentType("BANKING_CONFIRMATION_LETTER", SYNTHETIC_BANK_STATEMENT);
  assert.equal(result.result, "MISMATCH");
});

test("classifyDocumentType: a genuinely inconclusive document (invoice) is MANUAL_REVIEW, never a false MISMATCH, for Banking Confirmation Letter too", () => {
  const result = classifyDocumentType("BANKING_CONFIRMATION_LETTER", SYNTHETIC_INVOICE);
  assert.equal(result.result, "MANUAL_REVIEW");
});

test("classifyDocumentType: never claims official bank verification for a Banking Confirmation Letter's own reason text", () => {
  const result = classifyDocumentType("BANKING_CONFIRMATION_LETTER", SYNTHETIC_BANKING_CONFIRMATION_LETTER);
  assert.doesNotMatch(result.reason.toLowerCase(), /bank verified|officially verified|verified by the bank/);
});

test("matchExtractedData: a banking confirmation letter checks name only, never address or id number", () => {
  const result = matchExtractedData({ fullName: "Jane Smith" }, SYNTHETIC_BANKING_CONFIRMATION_LETTER);
  assert.equal(result.nameMatchResult, "MATCH");
  assert.equal(result.addressMatchResult, null);
  assert.equal(result.idNumberMatchResult, null);
});

test("matchExtractedData: identity document checks name + id number, never address", () => {
  const result = matchExtractedData({ fullName: "Jane Smith", idOrPassportNumber: "9001015008088" }, SYNTHETIC_SA_ID_TEXT);
  assert.equal(result.nameMatchResult, "MATCH");
  assert.equal(result.idNumberMatchResult, "MATCH");
  assert.equal(result.addressMatchResult, null);
});

test("matchExtractedData: proof-of-residence checks name + address, never an id number", () => {
  const result = matchExtractedData(
    { fullName: "Jane Smith", address: { addressLine1: "12 Oak Road", suburb: "Sunnyside", city: "Pretoria", postalCode: "0002" } },
    SYNTHETIC_MUNICIPAL_LETTER
  );
  assert.equal(result.addressMatchResult, "MATCH");
  assert.equal(result.idNumberMatchResult, null);
});

test("matchExtractedData: a clear name mismatch on an identity document is flagged", () => {
  const result = matchExtractedData({ fullName: "Peter Jones", idOrPassportNumber: "9001015008088" }, SYNTHETIC_SA_ID_TEXT);
  assert.equal(result.nameMatchResult, "MISMATCH");
});
