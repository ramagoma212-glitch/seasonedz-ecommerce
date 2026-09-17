// Metricool Web Analytics (Milestone 186).
//
// Additional website analytics only — never a replacement for GA4
// (js/analytics.js), never a Metricool API integration, never a
// second consent banner. Reuses the exact same consent gate GA4 uses
// (js/consent.js's hasConsent("analytics")/subscribeToConsentChanges())
// rather than inventing a separate one, per this milestone's own audit
// finding: Metricool is web analytics, the same category GA4 already
// belongs to.
//
// This file only ever calls the one official, documented Metricool
// entry point — beTracker.t({ hash }) — exactly once per page load,
// loading https://tracker.metricool.com/resources/be.js exactly once.
// No custom Metricool events are ever created here, so no customer
// name, email, phone number, address, order number, payment
// reference, or authentication/reset token is ever intentionally sent
// to Metricool by this file. The only thing Metricool passively
// observes is the ambient page URL — the same thing GA4 already
// observes on every route today (including the small number of routes
// that carry a token in their own query string, e.g. password reset —
// see this milestone's own audit report for why that pre-existing,
// GA4-equivalent exposure isn't newly introduced or silently
// "redesigned" here).
//
// Failure safety: nothing in this file may ever throw into a caller,
// and the tracker script is genuinely async — a slow or unreachable
// tracker.metricool.com must never block or break page rendering,
// navigation, cart, checkout, or any other part of the site.

import { hasConsent, subscribeToConsentChanges } from "./consent.js";

const TRACKER_SCRIPT_URL = "https://tracker.metricool.com/resources/be.js";
const TRACKER_HASH = "1a4cb5231d8873d12258557dd3fd3c36";

let initialized = false; // initMetricoolTracking() itself only ever runs its setup once
let scriptRequested = false; // the <script> tag is only ever appended once
let trackerInitialised = false; // beTracker.t() is only ever called once

// Appends the official Metricool loader exactly once. Mirrors the
// official snippet Metricool supplied (loadScript()'s onload/
// onreadystatechange pair, for older browser compatibility) rather
// than a simplified rewrite, so behaviour matches what Metricool
// itself documented and tested.
function loadTrackerScript(onReady) {
  if (scriptRequested) return;
  scriptRequested = true;

  try {
    const head = document.getElementsByTagName("head")[0];
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = TRACKER_SCRIPT_URL;
    script.async = true;
    script.onreadystatechange = onReady;
    script.onload = onReady;
    // A blocked/unreachable tracker.metricool.com (ad blocker, network
    // failure, offline) must never surface as an error anywhere else —
    // there is deliberately no onerror handler that does anything but
    // let the browser log its own network error; the rest of the site
    // never depends on this script having loaded.
    head.appendChild(script);
  } catch {
    // Never break the page over a script-tag insertion failure.
  }
}

function initTrackerOnce() {
  if (trackerInitialised) return;
  try {
    // beTracker is defined by the loaded resources/be.js — a missing
    // beTracker here (script blocked, failed, or still loading when
    // onload fires unexpectedly early in some browser) is a silent
    // no-op, never a thrown error.
    if (typeof window.beTracker?.t !== "function") return;
    window.beTracker.t({ hash: TRACKER_HASH });
    trackerInitialised = true;
  } catch {
    // Analytics must never break the shopping experience.
  }
}

function loadAndInitMetricool() {
  loadTrackerScript(initTrackerOnce);
}

// Safe to call once at app start (see js/app.js's mountApp(), right
// alongside initializeAnalytics()) — never throws, and does nothing at
// all before the customer has granted analytics consent.
export function initMetricoolTracking() {
  if (initialized) return;
  initialized = true;

  try {
    // Fires immediately with the current stored consent choice, then
    // again on every future change (js/consent.js's own documented
    // contract) — so a visitor who accepts analytics mid-session
    // starts loading Metricool from that point on, with no page
    // refresh required, the same way GA4 already behaves.
    subscribeToConsentChanges(() => {
      if (hasConsent("analytics")) loadAndInitMetricool();
    });
  } catch {
    // Never break app startup over the consent subscription itself.
  }
}
