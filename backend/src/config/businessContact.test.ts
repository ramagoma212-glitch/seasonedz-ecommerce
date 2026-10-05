// Milestone 202 completion: one official Seasonedz contact, shared by the public
// site and every outgoing message. These tests stop the two copies from drifting
// apart, and stop the retired number from returning to current code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { BUSINESS_CONTACT } from "./businessContact.js";

const REPO_ROOT = join(process.cwd(), "..");
const publicSource = readFileSync(join(REPO_ROOT, "src", "data", "businessInfo.js"), "utf8");

function publicValue(key: string): string {
  const match = publicSource.match(new RegExp(`${key}:\\s*"([^"]+)"`));
  assert.ok(match, `${key} missing from businessInfo.js`);
  return match[1]!;
}

const digitsOnly = (value: string) => value.replace(/[^0-9+]/g, "");

test("the public site and the backend share the same official phone number", () => {
  assert.equal(publicValue("phoneE164"), digitsOnly(BUSINESS_CONTACT.phone));
  assert.equal(publicValue("phoneDisplay"), "072 844 5644");
  assert.equal(BUSINESS_CONTACT.phone, "+27 72 844 5644");
});

test("the official WhatsApp and tel links use the same number", () => {
  assert.equal(publicValue("whatsappUrl"), "https://wa.me/27728445644");
  assert.equal(publicValue("telUrl"), "tel:+27728445644");
});

test("the public email and website match the backend contact", () => {
  assert.equal(publicValue("email"), BUSINESS_CONTACT.email);
  assert.equal(publicValue("websiteUrl"), BUSINESS_CONTACT.websiteUrl);
});

const STALE_NUMBER = new RegExp(["069[ -]?526[ -]?9941", "0695269941", "27695269941", "\\+27 ?69 ?526 ?9941"].join("|"));

function currentCodeFiles(directory: string, extensions: string[]): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...currentCodeFiles(full, extensions));
      continue;
    }
    if (/\.test\./.test(entry)) continue;
    if (extensions.some((extension) => entry.endsWith(extension))) found.push(full);
  }
  return found;
}

test("the retired telephone number does not appear in any current customer-facing code", () => {
  const files = [
    ...currentCodeFiles(join(REPO_ROOT, "backend", "src"), [".ts"]),
    ...currentCodeFiles(join(REPO_ROOT, "src"), [".js", ".jsx"]),
    ...currentCodeFiles(join(REPO_ROOT, "cloudflare", "chatbot-worker", "src"), [".ts", ".js"]),
  ];
  assert.ok(files.length > 50, "the scan must actually cover the application code");
  const offenders = files.filter((file) => STALE_NUMBER.test(readFileSync(file, "utf8"))).map((file) => relative(REPO_ROOT, file));
  assert.deepEqual(offenders, []);
});
