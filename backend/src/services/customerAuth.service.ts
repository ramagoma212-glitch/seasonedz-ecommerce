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
// Version 7, Milestone 132: within the 30-60 minute range required —
// 60 is the more generous end, matching EMAIL_SETUP.md's own
// documented default for this kind of link.
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
// Milestone 189: generous, unlike the password-reset link above — a
// "confirm your email" link sitting unread in an inbox for a few days
// is normal and must not force a customer to re-register.
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
  // Version 7, Milestone 171F: optional avatar, sourced only from a
  // connected Google/Facebook account (Apple never supplies one) — see
  // socialAuth.service.ts. Never required, so every pre-existing
  // password-only account simply has null here, unchanged.
  profileImageUrl: string | null;
  createdAt: Date;
}

// Never returns or logs a password hash, a session token, or a reset
// token — only ever this narrow, safe shape. Every function in this
// file (and socialAuth.service.ts, which shares this exact redaction
// discipline for provider-authenticated customers) goes through this.
export function toSafeProfile(customer: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  type: CustomerType;
  profileImageUrl: string | null;
  createdAt: Date;
}): SafeCustomerProfile {
  return {
    id: customer.id,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    type: customer.type,
    profileImageUrl: customer.profileImageUrl,
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

// Milestone 189: same "generate raw token, store only its hash" shape
// as createCustomerSession() above. Called once, right after
// registerCustomer() creates the row — kept as its own function rather
// than folded into registerCustomer() so registration itself stays
// focused on the account, and so a future caller (e.g. a "resend
// verification email" action) can request a fresh token without
// re-running registration. The raw token only ever exists in the
// verification-link email the controller sends with it.
export async function createEmailVerificationToken(customerId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS);

  await prisma.customer.update({
    where: { id: customerId },
    data: { emailVerificationTokenHash: hashToken(rawToken), emailVerificationExpiresAt: expiresAt },
  });

  return rawToken;
}

export interface EmailVerificationResult {
  customer: SafeCustomerProfile;
  // true only the one time this call is what actually set
  // emailVerifiedAt (a genuinely first-ever verification) — false if
  // the account was already verified before this call (e.g. a
  // double-clicked link, or the same link opened twice). Callers use
  // this, not just "success", to decide whether to trigger the welcome
  // gift — see welcomeGift.service.ts.
  firstTimeVerified: boolean;
}

// Milestone 189: looks up a customer by hashing the incoming raw token,
// same discipline as resetPasswordWithToken() above — a single generic
// CustomerAuthError covers "no matching token", "token expired", and
// "customer no longer active", never hinting at which. On success, the
// token fields are cleared (single use, same as a password-reset
// token) — a replayed/reused link then simply fails the lookup above
// with the same generic error, rather than re-triggering anything.
export async function verifyCustomerEmail(rawToken: string): Promise<EmailVerificationResult> {
  const customer = await prisma.customer.findFirst({
    where: { emailVerificationTokenHash: hashToken(rawToken), emailVerificationExpiresAt: { gt: new Date() }, isActive: true },
  });

  if (!customer) {
    throw new CustomerAuthError("This verification link is invalid or has expired.", 400);
  }

  // Conditional update (WHERE emailVerifiedAt IS NULL), not a plain
  // update — the actual atomicity guard against two concurrent requests
  // racing on the exact same valid token (e.g. an email client's link
  // scanner prefetching it, then the customer clicking it themselves).
  // At most one of them can ever match a row here; the loser gets
  // count 0 and is reported as firstTimeVerified: false, rather than
  // both having read emailVerifiedAt as null beforehand and both
  // believing they were first.
  const { count } = await prisma.customer.updateMany({
    where: { id: customer.id, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date(), emailVerificationTokenHash: null, emailVerificationExpiresAt: null },
  });

  const updatedCustomer = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
  return { customer: toSafeProfile(updatedCustomer), firstTimeVerified: count > 0 };
}

export interface PasswordResetRequestResult {
  customer: SafeCustomerProfile;
  rawToken: string;
}

// Version 7, Milestone 132: returns null for every case that must never
// be revealed to the caller — unknown email, inactive customer, or a
// hypothetical guest-only row with no passwordHash — so the controller
// can respond with the exact same generic "if an account exists..."
// message regardless of which case it was, the same no-enumeration
// discipline verifyCustomerCredentials() already applies to login.
// Only the SHA-256 hash of the reset token is ever stored — the raw
// token is returned here just once, for the caller to put in the
// reset-link email, and must never be logged or persisted anywhere
// else. Never sends anything itself — email dispatch is the
// controller's job (see customerAuth.controller.ts), same separation
// order.controller.ts already keeps from order.service.ts.
export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult | null> {
  const customer = await prisma.customer.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!customer || !customer.isActive || !customer.passwordHash) return null;

  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

  await prisma.customer.update({
    where: { id: customer.id },
    data: { passwordResetTokenHash: hashToken(rawToken), passwordResetExpiresAt: expiresAt },
  });

  return { customer: toSafeProfile(customer), rawToken };
}

// Version 7, Milestone 132: looks up a customer by hashing the
// incoming raw token — never by comparing raw values directly, same
// discipline as getCustomerBySessionToken(). A single CustomerAuthError
// message covers "no matching token", "token expired", and "customer
// no longer active" — deliberately generic, since a reset link is
// itself a bearer credential and shouldn't hint at why it failed.
// On success: hashes the new password, clears the reset token fields
// (single use), and destroys every existing session for this customer
// (a real password change must not leave an old, possibly-compromised
// session still valid).
export async function resetPasswordWithToken(rawToken: string, newPassword: string): Promise<SafeCustomerProfile> {
  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) {
    throw new CustomerAuthError(passwordError, 400);
  }

  const customer = await prisma.customer.findFirst({
    where: { passwordResetTokenHash: hashToken(rawToken), passwordResetExpiresAt: { gt: new Date() }, isActive: true },
  });

  if (!customer) {
    throw new CustomerAuthError("This reset link is invalid or has expired.", 400);
  }

  const passwordHash = await hashPassword(newPassword);

  const [updatedCustomer] = await prisma.$transaction([
    prisma.customer.update({
      where: { id: customer.id },
      data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null },
    }),
    prisma.customerSession.deleteMany({ where: { customerId: customer.id } }),
  ]);

  return toSafeProfile(updatedCustomer);
}
