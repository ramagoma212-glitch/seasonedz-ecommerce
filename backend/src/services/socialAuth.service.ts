// Shared social sign-in account-linking policy (Version 7, Milestone
// 171F). Provider-agnostic — googleOAuth.service.ts, facebookOAuth.
// service.ts, and appleOAuth.service.ts each independently verify a
// real provider response and hand this file only a small, already-
// verified VerifiedProviderIdentity; nothing here ever makes an HTTP
// call or trusts anything a frontend sent directly.
//
// This is the ONE place the milestone's core safety rules live:
//   - a provider identity is looked up by (provider, providerUserId)
//     FIRST, never by email — see findOrCreateCustomerForProviderLogin.
//   - an email match against an *existing* customer never silently
//     creates a duplicate customer or auto-links the provider to it —
//     it's reported back as ACCOUNT_EXISTS so the controller can show
//     the "sign in your existing way first" message the brief requires.
//   - linking a provider to an already-authenticated customer
//     (linkProviderToCustomer) is a fully separate operation from
//     login, and still can't ever move a provider identity that
//     already belongs to a different customer.
//   - disconnecting a provider can never leave a customer with zero
//     usable sign-in methods (unlinkProviderFromCustomer).

import type { AuthProvider, Customer } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { type SafeCustomerProfile, toSafeProfile } from "./customerAuth.service.js";

export type SocialAuthErrorCode =
  | "ACCOUNT_DISABLED"
  | "ACCOUNT_EXISTS"
  | "EMAIL_REQUIRED"
  | "PROVIDER_ALREADY_LINKED_ELSEWHERE"
  | "LAST_LOGIN_METHOD";

export class SocialAuthError extends Error {
  code: SocialAuthErrorCode;
  statusCode: number;

  constructor(code: SocialAuthErrorCode, message: string, statusCode = 409) {
    super(message);
    this.name = "SocialAuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const PROVIDER_DISPLAY_NAME: Record<AuthProvider, string> = {
  GOOGLE: "Google",
  FACEBOOK: "Facebook",
  APPLE: "Apple",
};

// The already-verified result of a real provider round-trip — every
// field here has been through that provider's own signature/issuer/
// audience/expiry checks (Google/Apple ID tokens) or a genuine Graph
// API profile fetch (Facebook) by the time this file ever sees it.
export interface VerifiedProviderIdentity {
  provider: AuthProvider;
  // The provider's own immutable subject identifier — Google/Apple
  // "sub", Facebook's numeric user id. Never an email address.
  providerUserId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

export interface SocialLoginResult {
  customer: SafeCustomerProfile;
  isNewCustomer: boolean;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Login/register via a verified provider identity. Lookup order is the
// brief's own required sequence:
//   1. provider + providerUserId (an existing AuthAccount) — if found,
//      this is simply that customer signing in again.
//   2. else, if the provider gave us an email, does an existing
//      customer already own it (password account, or a different
//      linked provider)? If so: refuse — never silently create a
//      second customer or auto-attach this provider to it.
//   3. else: create a new customer, password-less, and attach this
//      provider identity to it.
export async function findOrCreateCustomerForProviderLogin(identity: VerifiedProviderIdentity): Promise<SocialLoginResult> {
  const existingAccount = await prisma.authAccount.findUnique({
    where: { provider_providerUserId: { provider: identity.provider, providerUserId: identity.providerUserId } },
    include: { customer: true },
  });

  if (existingAccount) {
    if (!existingAccount.customer.isActive) {
      throw new SocialAuthError("ACCOUNT_DISABLED", "This account has been disabled. Contact support for help.", 403);
    }

    const updated = await prisma.customer.update({
      where: { id: existingAccount.customer.id },
      data: {
        lastLoginAt: new Date(),
        // Opportunistic refresh only — never overwrites a real photo
        // with a blank one if this particular login didn't supply one.
        ...(identity.profileImageUrl ? { profileImageUrl: identity.profileImageUrl } : {}),
      },
    });

    return { customer: toSafeProfile(updated), isNewCustomer: false };
  }

  const email = identity.email?.trim().toLowerCase() || null;

  if (email) {
    const existingByEmail = await prisma.customer.findUnique({ where: { email } });
    if (existingByEmail) {
      throw new SocialAuthError(
        "ACCOUNT_EXISTS",
        `An account already exists with this email. Sign in with your existing method first to securely connect ${PROVIDER_DISPLAY_NAME[identity.provider]}.`,
        409
      );
    }
  }

  // Version 7, Milestone 171F: Customer.email is a required, unique
  // column (unchanged by this milestone — see schema.prisma) — a brand
  // new customer cannot be created without one. Rather than inventing a
  // placeholder address (explicitly prohibited by the milestone brief),
  // a provider that withheld email on a first-time sign-in is reported
  // back as a clear, actionable error instead.
  if (!email) {
    throw new SocialAuthError(
      "EMAIL_REQUIRED",
      `We couldn't get an email address from ${PROVIDER_DISPLAY_NAME[identity.provider]}. Please allow email access and try again, or sign in a different way.`,
      422
    );
  }

  const firstName = nonEmpty(identity.firstName) ?? "Customer";
  const lastName = nonEmpty(identity.lastName) ?? "";

  const customer = await prisma.customer.create({
    data: {
      type: "REGISTERED",
      email,
      firstName,
      lastName,
      passwordHash: null,
      isActive: true,
      profileImageUrl: identity.profileImageUrl,
      lastLoginAt: new Date(),
      authAccounts: {
        create: { provider: identity.provider, providerUserId: identity.providerUserId },
      },
    },
  });

  return { customer: toSafeProfile(customer), isNewCustomer: true };
}

// Attaches a verified provider identity to an ALREADY AUTHENTICATED
// customer (the "Account Settings -> Connected Accounts -> Connect
// Google" flow) — never depends on email equality, only on the caller
// having independently proven both (a) the provider identity via a
// real OAuth round-trip and (b) the customer's own current session
// (see socialAuth.controller.ts, which re-checks the live session
// before ever calling this).
export async function linkProviderToCustomer(customerId: string, identity: VerifiedProviderIdentity): Promise<void> {
  const existingAccount = await prisma.authAccount.findUnique({
    where: { provider_providerUserId: { provider: identity.provider, providerUserId: identity.providerUserId } },
  });

  if (existingAccount) {
    if (existingAccount.customerId === customerId) {
      // Already connected to this same customer — idempotent no-op,
      // not an error (e.g. a double-click or a retried request).
      return;
    }
    throw new SocialAuthError(
      "PROVIDER_ALREADY_LINKED_ELSEWHERE",
      `This ${PROVIDER_DISPLAY_NAME[identity.provider]} account is already connected to a different Seasonedz account.`,
      409
    );
  }

  await prisma.$transaction([
    prisma.authAccount.create({ data: { customerId, provider: identity.provider, providerUserId: identity.providerUserId } }),
    ...(identity.profileImageUrl
      ? [prisma.customer.update({ where: { id: customerId }, data: { profileImageUrl: identity.profileImageUrl } })]
      : []),
  ]);
}

export interface ConnectedProviderStatus {
  provider: AuthProvider;
  connected: boolean;
}

const ALL_PROVIDERS: AuthProvider[] = ["GOOGLE", "FACEBOOK", "APPLE"];

// Safe for direct display in Account Settings — booleans only, never a
// providerUserId, never a token.
export async function listConnectedProviders(customerId: string): Promise<ConnectedProviderStatus[]> {
  const accounts = await prisma.authAccount.findMany({ where: { customerId }, select: { provider: true } });
  const connected = new Set(accounts.map((account) => account.provider));
  return ALL_PROVIDERS.map((provider) => ({ provider, connected: connected.has(provider) }));
}

// Removing the customer's only usable sign-in method would lock them
// out of their own account entirely — never permitted, regardless of
// how many OTHER providers exist, if this is genuinely the last one
// and there's no password either.
export async function unlinkProviderFromCustomer(customerId: string, provider: AuthProvider): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { passwordHash: true, authAccounts: { select: { provider: true } } },
  });

  if (!customer) return;

  const hasPassword = Boolean(customer.passwordHash);
  const otherProviderCount = customer.authAccounts.filter((account) => account.provider !== provider).length;
  const isCurrentlyConnected = customer.authAccounts.some((account) => account.provider === provider);

  if (!isCurrentlyConnected) return;

  if (!hasPassword && otherProviderCount === 0) {
    throw new SocialAuthError(
      "LAST_LOGIN_METHOD",
      "You can't disconnect your only sign-in method. Set a password or connect another provider first.",
      409
    );
  }

  await prisma.authAccount.deleteMany({ where: { customerId, provider } });
}

// Exported for socialAuth.controller.ts's re-verification of a "link"
// intent — see the file header on why the state cookie's
// linkingCustomerId is never trusted alone.
export async function getActiveCustomerById(customerId: string): Promise<Customer | null> {
  return prisma.customer.findUnique({ where: { id: customerId } });
}
