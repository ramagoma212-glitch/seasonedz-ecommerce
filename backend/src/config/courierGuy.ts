// Courier Guy configuration — backend-only (Version 7, Milestone 108).
//
// Admin-only RATE QUOTE feature. This file, courierGuy.service.ts, and
// adminCourier.controller.ts never call any Courier Guy/ShipLogic
// booking or shipment-creation endpoint — only POST {baseUrl}/rates.
// No booking is ever created and no waybill is ever generated from
// anywhere in this codebase.
//
// This module exposes Courier Guy settings to backend code only, same
// boundary as payfast.ts — the frontend build (Vite) doesn't include
// backend/src at all, but worth stating explicitly given how sensitive
// the API key is.
//
// Gated behind env.courierGuyEnabled — see env.ts for the fail-closed
// startup validation (collection-address fields + API key are only
// eagerly required once this is explicitly "true").

import { env } from "./env.js";

export interface CourierGuyAddressDefaults {
  company: string | undefined;
  streetAddress: string | undefined;
  localArea: string | undefined;
  city: string | undefined;
  zone: string | undefined;
  country: string;
  code: string | undefined;
  type: string;
}

export interface CourierGuyParcelDefaults {
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface CourierGuyConfig {
  enabled: boolean;
  apiKey: string | undefined;
  baseUrl: string;
  collection: CourierGuyAddressDefaults;
  defaultParcel: CourierGuyParcelDefaults;
}

export const courierGuyConfig: CourierGuyConfig = {
  enabled: env.courierGuyEnabled,
  apiKey: env.courierGuyApiKey,
  baseUrl: env.courierGuyBaseUrl,
  collection: {
    company: env.courierGuyCollectionCompany,
    streetAddress: env.courierGuyCollectionStreetAddress,
    localArea: env.courierGuyCollectionLocalArea,
    city: env.courierGuyCollectionCity,
    zone: env.courierGuyCollectionZone,
    country: env.courierGuyCollectionCountry,
    code: env.courierGuyCollectionCode,
    type: env.courierGuyCollectionType,
  },
  defaultParcel: {
    weightKg: env.courierGuyDefaultParcelWeightKg,
    lengthCm: env.courierGuyDefaultParcelLengthCm,
    widthCm: env.courierGuyDefaultParcelWidthCm,
    heightCm: env.courierGuyDefaultParcelHeightCm,
  },
};
