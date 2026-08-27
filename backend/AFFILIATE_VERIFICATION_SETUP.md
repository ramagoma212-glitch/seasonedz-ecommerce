# Affiliate Application & Document Verification Setup (Version 7, Milestone 176)

Upgrades ONLY the affiliate onboarding/verification process — the
existing Affiliate model, 7% commission, 5% referral discount, 30-day
attribution, R500 payout threshold and commission lifecycle are all
completely unchanged (`referralAffiliate.service.ts`'s
`approveAffiliate()`/`rejectAffiliate()` are reused as-is). This
document covers the one required manual step, environment variables,
and architecture decisions worth knowing.

## Required manual step: create the private Supabase Storage bucket

This backend never creates a Storage bucket itself — it must be created
once, manually, in the Supabase dashboard, exactly like the existing
`digital-products` bucket (see `DIGITAL_DOWNLOADS_SETUP.md`):

1. Open the Supabase project dashboard → Storage.
2. Create a new bucket named `affiliate-verification-documents` (or
   whatever value `AFFILIATE_VERIFICATION_DOCUMENTS_BUCKET` is set to).
3. **Leave "Public bucket" turned OFF.** These are applicants' identity
   and proof-of-residence documents — the single most important step.
4. Set the bucket's own file size limit to at least **8 MB**, matching
   this backend's own upload limit (`affiliateDocument.service.ts`'s
   `MAX_FILE_SIZE_BYTES`) — a file the backend accepts should never be
   able to fail the storage upload step on size alone.
5. No special RLS policies are required beyond the default (private)
   behaviour — every read/write to this bucket goes through the
   backend's own service-role client
   (`src/services/affiliateDocumentStorage.service.ts`), never a
   browser-facing anon key.

Until this bucket exists (or until `SUPABASE_URL`/
`SUPABASE_SERVICE_ROLE_KEY` are unset entirely), document upload/view
routes respond with a clear "not configured" error — every other part
of the application (the text-only sections, saving a draft, submitting
once documents exist) is otherwise unaffected. This is a genuine
**manual owner action still outstanding** as of this milestone's
delivery — it was not, and could not safely be, performed automatically
by this backend.

## Environment variables

| Variable | Required when | Notes |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Already required for product images/digital downloads | Shared credentials, same Supabase project. |
| `AFFILIATE_VERIFICATION_DOCUMENTS_BUCKET` | Optional | Defaults to `affiliate-verification-documents`. |

## How it works (for developers)

- `AffiliateApplication` — one row per Customer (`customerId` unique),
  status `DRAFT → SUBMITTED → UNDER_REVIEW → (ACTION_REQUIRED ↔ resubmit) → APPROVED | REJECTED`.
  Only ever creates/links a real `Affiliate` row at genuine submission
  (via the existing `createAffiliate()`), never earlier — see
  `affiliateApplication.service.ts`'s own header comment for the full
  state machine, including how a legacy PENDING affiliate from the old
  simple "Apply" flow is linked (never duplicated).
- `AffiliateApplicationDocument` — one row per uploaded document
  *version*; a replacement never overwrites in place, it creates a new
  row and marks the old one `isCurrent: false` (audit history survives).
  `storageBucket`/`storagePath` are internal-only, never returned by any
  API response.
- `AffiliateApplicationEvent` — append-only audit trail. Never stores
  raw document content, extracted text, or a full identity number.
- **Document verification levels** (`affiliateDocumentClassification.service.ts`):
  - **Level 1** (file validation) — extension, MIME type, and a real
    magic-byte check on the file's own first bytes (`affiliateDocument.service.ts`),
    independent of whatever Content-Type the browser sent.
  - **Level 2** (type classification) — keyword/structure heuristics per
    document type (bank statement, municipal account/letter, SA ID,
    passport), scored across multiple independent signals. Outcome is
    always `MATCH` / `MISMATCH` / `MANUAL_REVIEW` — never a claim of
    certainty this backend can't back up.
  - **Level 3** (data matching) — compares the applicant's entered
    name/address/identity number against extracted document text, with
    the same three-outcome honesty.
  - **Level 4** (authenticity) — **does not exist**. This backend has no
    government/bank identity-verification integration and makes no such
    claim anywhere in its UI or copy. Final approval is always a manual
    admin decision.
- **Text extraction** (`documentTextExtraction.service.ts`) — PDF only,
  via the small `pdf-parse` package (its real `lib/pdf-parse.js`
  implementation, not the package root — see that file's own comment on
  a debug-mode crash in the package root under this project's module
  loading). **Images (JPG/PNG) are never OCR'd** — a deliberate,
  disclosed limitation (see the Milestone 176 final report's own
  "Limitations of automated document verification" item), not an
  oversight: a real OCR engine would mean a large WASM/data-file
  footprint and unpredictable CPU cost on this project's small hosting
  plan, and sending an applicant's ID/passport/bank statement to a
  third-party OCR/AI service was never approved by the owner. An image
  upload (or a scanned/image-only PDF with no text layer) is honestly
  flagged `MANUAL_REVIEW`, never guessed.
- **Masking** — `AffiliateApplication.idNumber`/`passportNumber` are
  never returned unmasked to an admin caller by default
  (`affiliateIdentityValidation.util.ts`'s `maskIdentityNumber()`); a
  dedicated, audit-logged "Reveal" action is the only way to see the
  full value. The admin *list* view omits the field entirely, not even
  masked.

## "Other Accepted Proof of Residence" — accepted document types

Brief section 12 asks that, where a flexible "Other" proof-of-residence
category exists, the accepted document types are documented. Seasonedz
Group accepts, at admin discretion during manual review:

- A signed lease/rental agreement showing the applicant's name and address.
- A telephone, electricity, or other utility account in the applicant's name.
- A SARS notice of assessment or similar official correspondence.
- An insurance policy document showing the applicant's residential address.

This category has no automated classifier (see Level 2 above) — every
document submitted under "Other Accepted Proof of Residence" is always
`MANUAL_REVIEW`, decided by an admin, never automatically matched or
rejected.

## Data retention — recommended, not yet enforced

No automatic deletion is implemented anywhere in this milestone (brief
section 54 explicitly warns against inventing a legal retention period).
Recommended values, for owner decision:

- **Pending/under-review application documents**: retain for the
  duration of active review, plus a reasonable buffer (e.g. 90 days)
  after a final decision, to allow the applicant to query the outcome.
- **Approved affiliate verification records**: retain for the duration
  of the affiliate relationship, plus a period aligned with this
  business's general financial/audit record retention (see the main
  Privacy Policy's own section 19) — commonly 5 years in South African
  practice, but this is a recommendation, not a configured value.
- **Rejected/withdrawn application documents**: a shorter retention
  (e.g. 12 months) is commonly reasonable, balancing dispute/fraud
  investigation needs against data minimisation — again, not yet
  configured or enforced by any code.

No cron job, scheduled task, or manual script in this codebase deletes
affiliate verification documents today. Implementing one is future work
once the owner has chosen real values.

## Account deletion

No customer/account deletion feature exists anywhere in this codebase
today (audited as part of this milestone, brief section 55) — so there
is currently no risk of affiliate verification data being orphaned by
one. This should be revisited if/when an account-deletion feature is
ever built.
