// PayFast configuration — backend-only (Version 3, Milestone 20).
//
// This module exposes PayFast settings to backend code only. It must
// never be imported by anything that ships to the browser — the
// frontend build (Vite) doesn't include backend/src at all, but the
// boundary is worth stating explicitly given how sensitive
// merchantId/merchantKey/passphrase are. See backend/PAYFAST_SETUP.md.
//
// Nothing in this milestone calls PayFast with this config yet — no
// payment initiation, no ITN handling. That's later work, gated behind
// env.payfastEnabled (see order.validator.ts and env.ts).

import { env } from "./env.js";

const SANDBOX_PROCESS_URL = "https://sandbox.payfast.co.za/eng/process";
const PRODUCTION_PROCESS_URL = "https://www.payfast.co.za/eng/process";

export interface PayfastConfig {
  enabled: boolean;
  mode: "sandbox" | "production";
  merchantId: string | undefined;
  merchantKey: string | undefined;
  passphrase: string | undefined;
  processUrl: string;
  returnUrl: string | undefined;
  cancelUrl: string | undefined;
  notifyUrl: string | undefined;
}

export const payfastConfig: PayfastConfig = {
  enabled: env.payfastEnabled,
  mode: env.payfastMode,
  merchantId: env.payfastMerchantId,
  merchantKey: env.payfastMerchantKey,
  passphrase: env.payfastPassphrase,
  processUrl: env.payfastMode === "production" ? PRODUCTION_PROCESS_URL : SANDBOX_PROCESS_URL,
  returnUrl: env.payfastReturnUrl,
  cancelUrl: env.payfastCancelUrl,
  notifyUrl: env.payfastNotifyUrl,
};
