import { EnquiryStatus, EnquiryType } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import type { ValidatedEnquiryInput } from "../validators/enquiry.validator.js";

export interface EnquiryCreateOutput {
  id: string;
  type: EnquiryType;
  status: EnquiryStatus;
  createdAt: Date;
}

// `select` (not the full row) is used deliberately, on both queries in
// this file — this is the one model in the API where "never leak
// personal details beyond what's explicitly needed" matters enough
// that it's enforced at the query itself, not just left to careful
// output-shaping afterwards.
export async function createEnquiry(input: ValidatedEnquiryInput): Promise<EnquiryCreateOutput> {
  return prisma.enquiry.create({
    data: {
      type: input.type,
      status: EnquiryStatus.NEW,
      name: input.name,
      email: input.email,
      phone: input.phone,
      companyName: input.companyName,
      organisationType: input.organisationType,
      subject: input.subject,
      message: input.message,
      province: input.province,
      city: input.city,
      // Schema stores this as free text (Enquiry.estimatedQuantity is
      // String?, see schema.prisma) — the validator already confirmed
      // it's a positive integer before it gets here.
      estimatedQuantity: input.estimatedQuantity !== null ? String(input.estimatedQuantity) : null,
    },
    select: { id: true, type: true, status: true, createdAt: true },
  });
}

export interface EnquiryPublicStatusOutput {
  id: string;
  type: EnquiryType;
  status: EnquiryStatus;
  createdAt: Date;
  message: string;
}

const STATUS_MESSAGES: Record<EnquiryStatus, string> = {
  NEW: "Your enquiry has been received.",
  IN_REVIEW: "Your enquiry is being reviewed by our team.",
  RESPONDED: "We've responded to your enquiry — please check your email.",
  CLOSED: "This enquiry has been closed.",
};

// Deliberately narrow: no name/email/phone/message/company — anything
// that could identify the enquirer or reveal what they wrote. This is
// a public, unauthenticated lookup (there's no login), so it must stay
// safe to expose to anyone who has (or guesses) an id.
export async function getPublicEnquiryStatusById(id: string): Promise<EnquiryPublicStatusOutput | null> {
  const enquiry = await prisma.enquiry.findUnique({
    where: { id },
    select: { id: true, type: true, status: true, createdAt: true },
  });

  if (!enquiry) {
    return null;
  }

  return {
    ...enquiry,
    message: STATUS_MESSAGES[enquiry.status],
  };
}
