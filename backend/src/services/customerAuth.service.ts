// Customer authentication service (Version 7, Milestone 127 — backend
// foundation only, no frontend UI wired up yet). Mirrors the proven
// admin-auth pattern (see adminAuth.service.ts) — bcrypt password
// hashing, server-side session storage keyed by a SHA-256 hash of a
// random token, HttpOnly signed cookie — but deliberately kept in a
// fully separate table (CustomerSession, not AdminSession) and fully
// separate cookie (customer_session, not admin_session). A customer
// session must never authenticate an admin route, and vice versa —
// see requireCustomerAuth.middleware.ts.
//
// Extends the existing (previously unused) Customer model rather than
// a new table — see schema.prisma's own comment on Customer for why
// this is safe. Nothing here touches Order, Payment, Shipping, or
// Product in any way; order/checkout attachment is explicitly out of
// scope for this milestone.

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { CustomerType } from "@prisma/client";
import { prisma } from "../config/prisma.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, same as admin
const BCRYPT_SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

// Shared cookie name/max-age so the controller (sets it) and
// middleware (reads it) never drift apart — deliberately distinct from
// ADMIN_SESSION_COOKIE_NAME.
export const CUSTOMER_SESSION_COOKIE_NAME = "customer_session";
export const CUSTOMER_SESSION_COOKIE_MAX_AGE_MS = SESSION_TTL_MS;

export class CustomerAuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "CustomerAuthError";
    this.statusCode = statusCode;
  }
}

export interface SafeCustomerProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  type: CustomerType;
  createdAt: Date;
}

// Never returns or logs a password hash, a session token, or a reset
// token — only ever this narrow, safe shape. Every function in this
// file that returns customer data goes through this.
function toSafeProfile(customer: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  type: CustomerType;
  createdAt: Date;
}): SafeCustomerProfile {
  return {
    id: customer.id,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    type: customer.type,
    createdAt: customer.createdAt,
  };
}

// A session token is a high-entropy random value, not a password —
// SHA-256 (not bcrypt) is the correct tool here, same reasoning as
// adminAuth.service.ts's hashToken(). Only the hash is ever stored;
// the raw token exists only in the HttpOnly cookie sent to the browser.
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function validatePasswordStrength(plainPassword: string): string | null {
  if (typeof plainPassword !== "string" || plainPassword.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
}

export interface RegisterCustomerInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

// Creates a new Customer row with type: REGISTERED. Email is
// normalised (trim + lowercase) before the uniqueness check and before
// storage, so "Jane@Example.com" and "jane@example.com" are always
// treated as the same account. A duplicate email is a safe, clear
// CustomerAuthError (not a generic "something went wrong") — unlike
// login, registration conventionally does confirm whether an email is
// already in use; this is standard practice and was a deliberate
// planning decision (Milestone 126), distinct from login's own
// no-enumeration requirement below.
export async function registerCustomer(input: RegisterCustomerInput): Promise<SafeCustomerProfile> {
  const email = input.email.trim().toLowerCase();
  const passwordError = validatePasswordStrength(input.password);
  if (passwordError) {
    throw new CustomerAuthError(passwordError, 400);
  }

  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing) {
    throw new CustomerAuthError("An account with that email already exists.", 409);
  }

  const passwordHash = await hashPassword(input.password);

  const customer = await prisma.customer.create({
    data: {
      type: CustomerType.REGISTERED,
      email,
      passwordHash,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone?.trim() || null,
      isActive: true,
    },
  });

  return toSafeProfile(customer);
}

// Returns the customer's safe profile on success, or null on any
// failure (unknown email, no password set i.e. a hypothetical
// guest-only row, wrong password, inactive account) — deliberately the
// same null result for every failure case, so the controller can
// return one generic "Invalid email or password" message regardless of
// which check failed, never revealing whether an email is registered.
export async function verifyCustomerCredentials(email: string, plainPassword: string): Promise<SafeCustomerProfile | null> {
  const customer = await prisma.customer.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!customer || !customer.isActive || !customer.passwordHash) return null;

  const passwordMatches = await bcrypt.compare(plainPassword, customer.passwordHash);
  if (!passwordMatches) return null;

  await prisma.customer.update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } });

  return toSafeProfile(customer);
}

// Creates a new session row and returns the raw token — the only time
// the raw token ever exists outside the HttpOnly cookie. The caller
// (the login/register controller) must not log or persist it anywhere
// else.
export async function createCustomerSession(customerId: string): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.customerSession.create({
    data: { customerId, tokenHash: hashToken(rawToken), expiresAt },
  });

  return { rawToken, expiresAt };
}

// Looks up a session by hashing the incoming raw token and comparing
// against the stored hash — never reads or compares a raw token
// directly. Returns null (never throws) for any invalid/expired/
// inactive-customer case, so the middleware can respond with a uniform
// 401 either way.
export async function getCustomerBySessionToken(rawToken: string): Promise<SafeCustomerProfile | null> {
  const session = await prisma.customerSession.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { customer: true },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  if (!session.customer.isActive) return null;

  // Best-effort freshness update — never blocks or fails the request
  // if it errors, since it's not required for the auth decision itself.
  prisma.customerSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return toSafeProfile(session.customer);
}

// Deletes the session row matching this token, if any — logout is
// idempotent: calling it with an already-invalid/unknown token is not
// an error, it just means there is nothing left to clear.
export async function destroyCustomerSession(rawToken: string): Promise<void> {
  await prisma.customerSession.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}
