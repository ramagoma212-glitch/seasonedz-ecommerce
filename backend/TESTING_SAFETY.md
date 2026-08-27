# Test Database Safety (Version 7, Milestone 174C, Section 0)

This project has **no separate test database**. `DATABASE_URL`/
`DIRECT_URL` point at the same real Supabase Postgres instance the
live site uses, in every environment — local development, this
backend's own automated tests, and production — all alike. This is a
standing, deliberate characteristic of this project (see the project's
own "local DB is production" convention), not something this milestone
changed or could unilaterally fix by standing up a second database.

## Why this file exists

Milestone 174B's own test suite briefly, accidentally wrote 8 real
rows into the production `Notification` table: a test's fire-and-forget
notification call raced past its own stub cleanup and fell through to
the real, unstubbed Prisma client. The rows were deleted and the
immediate race was fixed in that test file, but nothing structurally
prevented the *next* test — anywhere in this codebase, written by
anyone, today or in a future milestone — from doing the exact same
thing. `src/config/testDbGuard.ts` is that structural prevention.

## How it works

Two independent layers, both installed from `src/config/prisma.ts` —
the one module every test file already imports — before any test
file's own code runs:

1. **`assertSafeTestEnvironment()`** — refuses to start the whole test
   process if it detects the known production database (recognised by
   the Supabase project ref embedded in the connection string's
   username — a public identifier, never a secret) and
   `TEST_DB_ACKNOWLEDGE_SHARED_PRODUCTION` isn't explicitly `"true"`.
   `npm test` sets this itself, via `cross-env` (so it works identically
   on Windows and POSIX shells — see `package.json`). The point isn't
   to block `npm test` itself; it's to make an *unexpected* invocation
   (a misconfigured CI job, a differently-wired script, a copy-pasted
   command with the wrong env) fail loudly instead of quietly sharing
   production.

2. **`installProductionWriteGuard()`** — the real enforcement. Wraps
   every mutating method (`create`, `update`, `upsert`, `delete`, and
   their `*Many` variants) on every Prisma model delegate, plus
   `$transaction`/`$executeRaw`/`$executeRawUnsafe`, so a call that
   reaches the real client **without first being re-stubbed by the
   individual test** throws a `ProductionWriteBlockedError` immediately
   — loud, in the test output, failing that test — instead of silently
   writing to production. Read methods (`findUnique`, `findMany`,
   `count`, `$queryRaw`, ...) are left untouched; this project has an
   existing, accepted precedent of a handful of tests making real
   *read* calls (e.g. `generateOrderNumber()`'s own uniqueness check),
   which are harmless and unaffected by this guard.

Crucially, this wrapper is installed **before** any test file's own
`stub()`/`restore()` helper runs. Every such helper in this codebase
follows the same shape:

```ts
const original = obj[key];
obj[key] = myStubImplementation;
// ...later...
obj[key] = original; // "restore"
```

Because the guard runs first, `original` here is never the raw,
unguarded Prisma method — it's the guard's own throwing wrapper. So
even the exact 174B failure mode (a stub restored a few microtask
ticks before an in-flight fire-and-forget chain actually finishes with
it) now falls through to the guard, not to a real write.

## What this means day to day

- **Nothing changes for a correctly-written test.** Every test in this
  codebase already stubs the Prisma calls it uses — this guard is
  invisible to them.
- **A newly-introduced, unstubbed real write now fails loudly**, with
  a clear error naming the exact model and method that needs stubbing,
  instead of silently succeeding against production. This is by far
  the most common way this guard will ever be "seen" — see
  `socialAuth.service.test.ts`'s "an authenticated customer can
  securely link a new provider identity" test, fixed during this same
  milestone after the guard caught it: `linkProviderToCustomer()`
  builds an array-style `$transaction([...])`, whose elements
  (`prisma.authAccount.create(...)`, `prisma.customer.update(...)`)
  are evaluated to build the array *before* `$transaction()` itself is
  ever called — so stubbing only `$transaction` was never enough, and
  this test had been making two real, unnoticed writes to production
  on every single run since Milestone 171F, long before 174B or this
  guard existed.
- **Running a single test file directly** (`npx tsx --test
  src/foo.test.ts`, without going through `npm test`) needs the same
  acknowledgment prefixed manually: `TEST_DB_ACKNOWLEDGE_SHARED_PRODUCTION=true
  npx tsx --test src/foo.test.ts`. `npm test` (the whole suite) never
  needs this — it's already wired in.

## Playwright (frontend)

`tests/smoke/*.spec.js` needs no equivalent guard. Those specs drive a
real browser against the live site over HTTP — they never import
Prisma or any backend source at all, so they can only ever affect data
through the exact same API surface a real customer uses (rate-limited,
validated, authenticated exactly as production requires), never
directly. There is nothing here for this guard to protect that isn't
already protected by the backend's own normal request handling.

## What this guard is not

It does not, and cannot, prevent a *read* against production (an
accepted, pre-existing, low-risk pattern in a few tests), and it does
not replace careful test design — a test that means to stub
`prisma.order.update` but stubs `prisma.order.findUnique` instead will
still fail, just with a different, equally clear signal (a real write
blocked, or a stub never being called). It is a safety net for the
specific, real failure mode this project has already experienced
twice (Milestone 174B's fire-and-forget race, and the pre-existing
`socialAuth.service.test.ts` gap this same milestone found), not a
substitute for reviewing what a new test actually stubs.

**Never weaken or remove this guard "for convenience."** If a test
seems to require a real database write to pass, the test is wrong, not
the guard.
