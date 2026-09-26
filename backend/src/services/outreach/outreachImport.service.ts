// Milestone 198, Part 6: bulk contact import — CSV upload and a simpler
// "paste contacts" text box. Both parse down to the same RawImportRow
// shape, then share one preview/commit pipeline so the two entry points
// can never disagree about what counts as valid/duplicate/invalid.
//
// Import and sending are always two separate actions (Part 6's own
// explicit requirement) — nothing in this file ever sends an email;
// commitImport() only ever writes OutreachContact rows.

import { OutreachContactStatus } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { isValidOutreachEmail, normalizeOutreachEmail } from "./outreachContact.service.js";

export interface RawImportRow {
  organisationName?: string;
  contactName?: string;
  email: string;
  phone?: string;
  organisationType?: string;
  province?: string;
  city?: string;
  website?: string;
  source?: string;
  sourceUrl?: string;
  notes?: string;
  tags?: string[];
}

const CSV_COLUMNS = ["organisation_name", "contact_name", "email", "phone", "organisation_type", "province", "city", "website", "source", "source_url", "notes", "tags"] as const;

// A small, self-contained CSV line-splitter — RFC4180-ish: handles
// quoted fields (so a comma or a literal quote inside "..." doesn't
// split/break a field), nothing more elaborate. No dependency needed
// for a feature this narrow.
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

// Accepts a header row in any order, matching Part 6's own expected
// column list — a column simply absent from the header means every row
// leaves that field blank, never an error (Part 6: "Do not require
// every optional column"). Unknown extra columns are ignored.
export function parseOutreachContactsCsv(text: string): RawImportRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const header = splitCsvLine(lines[0] ?? "").map((column) => column.trim().toLowerCase());
  const columnIndex = new Map<string, number>();
  CSV_COLUMNS.forEach((column) => {
    const index = header.indexOf(column);
    if (index !== -1) columnIndex.set(column, index);
  });

  // Never silently treats data as a header — a header row must contain
  // at least "email" as a recognised column, otherwise every "row"
  // (including what would have been the header) is parsed as data with
  // the "paste contacts" fallback below, which alone would produce
  // nonsense; safer to just require it explicitly.
  if (!columnIndex.has("email")) {
    throw new Error('CSV must include an "email" column header.');
  }

  const rows: RawImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i] ?? "");
    const get = (column: (typeof CSV_COLUMNS)[number]): string | undefined => {
      const index = columnIndex.get(column);
      if (index === undefined) return undefined;
      const value = fields[index]?.trim();
      return value ? value : undefined;
    };

    const email = get("email");
    if (!email) continue; // a row with no email at all carries nothing this system can use

    const tagsRaw = get("tags");
    rows.push({
      organisationName: get("organisation_name"),
      contactName: get("contact_name"),
      email,
      phone: get("phone"),
      organisationType: get("organisation_type"),
      province: get("province"),
      city: get("city"),
      website: get("website"),
      source: get("source"),
      sourceUrl: get("source_url"),
      notes: get("notes"),
      tags: tagsRaw
        ? tagsRaw
            .split(/[;|]/)
            .map((tag) => tag.trim())
            .filter(Boolean)
        : undefined,
    });
  }
  return rows;
}

// Part 6: "For pasted data, support simple formats such as
// school@example.com... and preferably structured rows where
// organisation information is available." A line is treated as a
// structured CSV-ish row (comma-separated) if it contains a comma;
// otherwise it's treated as a bare email address on its own line.
export function parsePastedOutreachContacts(text: string): RawImportRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows: RawImportRow[] = [];

  for (const line of lines) {
    if (line.includes(",")) {
      const [organisationName, email, contactName, phone] = line.split(",").map((part) => part.trim());
      if (!email) continue;
      rows.push({ organisationName: organisationName || undefined, email, contactName: contactName || undefined, phone: phone || undefined });
    } else {
      rows.push({ email: line });
    }
  }
  return rows;
}

export interface ImportPreviewRow extends RawImportRow {
  rowNumber: number;
  normalizedEmail: string;
  outcome: "valid" | "duplicate_in_db" | "duplicate_in_upload" | "invalid_email" | "suppressed";
  existingOrganisationName?: string | null;
}

export interface ImportPreviewResult {
  rows: ImportPreviewRow[];
  counts: {
    total: number;
    valid: number;
    duplicateInDb: number;
    duplicateInUpload: number;
    invalidEmail: number;
    suppressed: number;
  };
}

// Never writes anything — Part 6's own explicit "show an IMPORT PREVIEW
// ... owner should confirm before import" requirement. Every row is
// classified into exactly one outcome bucket so the admin can see the
// real shape of what they're about to import before committing to it.
export async function previewOutreachImport(rows: RawImportRow[]): Promise<ImportPreviewResult> {
  const seenInUpload = new Set<string>();
  const normalizedEmails = rows.map((row) => normalizeOutreachEmail(row.email));
  const existingContacts = await prisma.outreachContact.findMany({
    where: { email: { in: normalizedEmails } },
    select: { email: true, organisationName: true, status: true },
  });
  const existingByEmail = new Map(existingContacts.map((contact) => [contact.email, contact]));

  const previewRows: ImportPreviewRow[] = rows.map((row, index) => {
    const normalizedEmail = normalizeOutreachEmail(row.email);
    const rowNumber = index + 1;

    if (!isValidOutreachEmail(normalizedEmail)) {
      return { ...row, rowNumber, normalizedEmail, outcome: "invalid_email" };
    }
    if (seenInUpload.has(normalizedEmail)) {
      return { ...row, rowNumber, normalizedEmail, outcome: "duplicate_in_upload" };
    }
    seenInUpload.add(normalizedEmail);

    const existing = existingByEmail.get(normalizedEmail);
    if (existing) {
      if (existing.status !== OutreachContactStatus.ACTIVE) {
        return { ...row, rowNumber, normalizedEmail, outcome: "suppressed", existingOrganisationName: existing.organisationName };
      }
      return { ...row, rowNumber, normalizedEmail, outcome: "duplicate_in_db", existingOrganisationName: existing.organisationName };
    }

    return { ...row, rowNumber, normalizedEmail, outcome: "valid" };
  });

  const counts = {
    total: previewRows.length,
    valid: previewRows.filter((row) => row.outcome === "valid").length,
    duplicateInDb: previewRows.filter((row) => row.outcome === "duplicate_in_db").length,
    duplicateInUpload: previewRows.filter((row) => row.outcome === "duplicate_in_upload").length,
    invalidEmail: previewRows.filter((row) => row.outcome === "invalid_email").length,
    suppressed: previewRows.filter((row) => row.outcome === "suppressed").length,
  };

  return { rows: previewRows, counts };
}

// Only ever creates genuinely NEW contacts (outcome "valid" in a fresh
// preview run against the current DB state) — Part 12's own explicit
// "importing the address again must not silently remove suppression"
// requirement is satisfied by never touching an existing row's status
// (or any other field) here at all; a duplicate/suppressed email is
// simply skipped, not merged or overwritten.
export async function commitOutreachImport(rows: RawImportRow[]): Promise<{ created: number; skipped: number }> {
  const preview = await previewOutreachImport(rows);
  const toCreate = preview.rows.filter((row) => row.outcome === "valid");

  if (toCreate.length === 0) return { created: 0, skipped: preview.rows.length };

  await prisma.outreachContact.createMany({
    data: toCreate.map((row) => ({
      organisationName: row.organisationName?.trim() || null,
      contactName: row.contactName?.trim() || null,
      email: row.normalizedEmail,
      phone: row.phone?.trim() || null,
      organisationType: row.organisationType?.trim() || null,
      province: row.province?.trim() || null,
      city: row.city?.trim() || null,
      website: row.website?.trim() || null,
      source: row.source?.trim() || null,
      sourceUrl: row.sourceUrl?.trim() || null,
      notes: row.notes?.trim() || null,
      tags: row.tags ?? [],
    })),
    skipDuplicates: true, // defence in depth against a same-millisecond race — the preview above is the real duplicate check
  });

  return { created: toCreate.length, skipped: preview.rows.length - toCreate.length };
}
