-- Milestone 178, Part B: adds the single document slot a NEW affiliate
-- application must upload (a Banking Confirmation Letter), replacing
-- IDENTITY/PROOF_OF_RESIDENCE as the required upload for new
-- applications. Purely additive — IDENTITY and PROOF_OF_RESIDENCE stay
-- defined so every historical AffiliateApplicationDocument row (never
-- deleted, never rewritten) keeps resolving exactly as before.
ALTER TYPE "AffiliateDocumentSlot" ADD VALUE 'BANKING_CONFIRMATION_LETTER';
