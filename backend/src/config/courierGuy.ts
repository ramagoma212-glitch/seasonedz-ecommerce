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

// Version 7, Milestone 112: the collection contact person for a real
// booking — separate from CourierGuyAddressDefaults above, which only
// describes the collection *address*. ShipLogic's documented booking
// schema lists collection_contact as its own object alongside
// collection_address.
export interface CourierGuyContactDefaults {
  name: string | undefined;
  phone: string | undefined;
  email: string | undefined;
}

export interface CourierGuyParcelDefaults {
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface CourierGuyConfig {
  enabled: boolean;
  bookingEnabled: boolean;
  apiKey: string | undefined;
  baseUrl: string;
  collection: CourierGuyAddressDefaults;
  collectionContact: CourierGuyContactDefaults;
  defaultParcel: CourierGuyParcelDefaults;
}

export const courierGuyConfig: CourierGuyConfig = {
  enabled: env.courierGuyEnabled,
  bookingEnabled: env.courierGuyBookingEnabled,
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
  collectionContact: {
    name: env.courierGuyCollectionContactName,
    phone: env.courierGuyCollectionContactPhone,
    email: env.courierGuyCollectionContactEmail,
  },
  defaultParcel: {
    weightKg: env.courierGuyDefaultParcelWeightKg,
    lengthCm: env.courierGuyDefaultParcelLengthCm,
    widthCm: env.courierGuyDefaultParcelWidthCm,
    heightCm: env.courierGuyDefaultParcelHeightCm,
  },
};
