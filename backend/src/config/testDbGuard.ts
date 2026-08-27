// Version 7, Milestone 174C, section 0: a permanent safeguard against a
// repeat of Milestone 174B's own incident — a test's fire-and-forget
// notification call raced past its own stub cleanup and wrote 8 real
// rows into the production Notification table. This project has no
// separate test database (see the project's standing "local DB is
// production" convention: DATABASE_URL/DIRECT_URL always point at the
// real Supabase instance the live site uses, in every environment,
// test included) — so the fix can't be "point tests at a different
// database." It has to be two independent layers on top of the one
// database that exists:
//
//   1. assertSafeTestEnvironment() — a start-of-run gate. A test run
//      refuses to start at all if it resolves to the known production
//      project AND TEST_DB_ACKNOWLEDGE_SHARED_PRODUCTION isn't
//      explicitly "true". `npm test` sets this itself (via cross-env,
//      for Windows/POSIX parity — see package.json) precisely because
//      this project's tests are KNOWN to share the production
//      database; the acknowledgment exists so that can never be true
//      by accident for some other, unexpected invocation (a
//      misconfigured CI job, a differently-wired script) — it fails
//      loud instead of running unverified.
//
//   2. installProductionWriteGuard() — the real enforcement. Wraps
//      every mutating method (create/update/upsert/delete + the
//      *Many variants) on every model delegate, plus $transaction and
//      the raw-SQL write escape hatches, so that ANY call which
//      reaches the real client without first being re-stubbed by the
//      individual test throws immediately. This is what actually
//      would have caught 174B's leak: a stub restored a few
//      microticks too early no longer falls through to a real,
//      unguarded Prisma method — it falls through to THIS wrapper,
//      because a test's own `stub()`/`restore()` helper captures
//      whatever is installed on the delegate at stub time as "the
//      original" to restore back to. Installed before any test file's
//      own stubs run (from config/prisma.ts, the one module every
//      test file already imports), so this ordering holds everywhere.
//
// Only the hostname and username of DATABASE_URL/DIRECT_URL are ever
// read here (via the URL class) — a Supabase pooler username is
// "postgres.<project-ref>", and the project ref alone is a public
// identifier (visible in the project's own dashboard/API URLs), never
// a secret. The password segment is parsed and immediately discarded;
// it is never read, compared, logged, or included in any error
// message this file produces.
//
// Playwright (frontend/tests/smoke) needs no equivalent guard: those
// specs drive a browser against the live site over HTTP and never
// import Prisma or this backend's source at all — they can only ever
// mutate data through the exact same API surface a real customer
// uses, not directly.

const KNOWN_PRODUCTION_PROJECT_REF = "mswnhwsksocsrbcrdzyb";
const ACKNOWLEDGE_ENV_VAR = "TEST_DB_ACKNOWLEDGE_SHARED_PRODUCTION";

// A process launched to run test files always has at least one
// ".test.ts"/".test.js" entry in argv — true whether invoked as
// `npm test` (bash-expands the glob into individual file paths),
// `tsx --test src/foo.test.ts` directly, or (on a shell with no `**`
// glob expansion of its own) as the literal pattern string
// "src/**/*.test.ts", which itself still ends in ".test.ts". A real
// app/script invocation (`node dist/server.js`, `npm run
// notifications:process`, `npm run seed`) never has any such entry.
export function isRunningTestFiles(argv: readonly string[] = process.argv): boolean {
  return argv.some((arg) => arg.endsWith(".test.ts") || arg.endsWith(".test.js"));
}

function projectRefFromConnectionString(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const [, ref] = url.username.split(".");
    return ref ?? null;
  } catch {
    return null;
  }
}

export interface TestDatabaseSafetyCheck {
  safe: boolean;
  reason?: string;
}

// Pure and side-effect-free — fully unit-testable without spawning a
// real process, exiting, or touching real env vars.
export function evaluateTestDatabaseSafety(env: NodeJS.ProcessEnv): TestDatabaseSafetyCheck {
  const refs = [projectRefFromConnectionString(env.DATABASE_URL), projectRefFromConnectionString(env.DIRECT_URL)];
  const pointsAtKnownProduction = refs.some((ref) => ref === KNOWN_PRODUCTION_PROJECT_REF);
  const acknowledged = env[ACKNOWLEDGE_ENV_VAR] === "true";

  if (pointsAtKnownProduction && !acknowledged) {
    return {
      safe: false,
      reason:
        `Refusing to start: DATABASE_URL/DIRECT_URL resolve to the known production database ` +
        `(project ref "${KNOWN_PRODUCTION_PROJECT_REF}"), and ${ACKNOWLEDGE_ENV_VAR} is not set to "true". ` +
        `This project has no separate test database, so every test run does genuinely share the ` +
        `production connection by design — see backend/TESTING_SAFETY.md. If this is a deliberate, ` +
        `known test run, set ${ACKNOWLEDGE_ENV_VAR}=true (already set automatically by "npm test" — see ` +
        `package.json). Never set it globally just to silence this message; it exists so an unexpected ` +
        `invocation can never share production silently.`,
    };
  }

  return { safe: true };
}

// Called once, at import time, from config/prisma.ts. Exits the whole
// process rather than throwing — a thrown error here could in
// principle be caught by something upstream and swallowed; a
// non-zero process.exit cannot be.
export function assertSafeTestEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const result = evaluateTestDatabaseSafety(env);
  if (!result.safe) {
    const banner = "=".repeat(70);
    // eslint-disable-next-line no-console
    console.error(`\n${banner}\nTEST DATABASE SAFETY GUARD\n${banner}\n${result.reason}\n${banner}\n`);
    process.exit(1);
  }
}

export class ProductionWriteBlockedError extends Error {
  constructor(target: string, method: string) {
    super(
      `BLOCKED: a real ${target}.${method}(...) call reached the actual database during a test run. ` +
        `Every test in this codebase stubs the Prisma calls it needs — this one wasn't stubbed (or a ` +
        `stub was restored before an in-flight async chain finished with it; see ` +
        `notificationEngine.service.test.ts's own flushAsync() pattern for the fix). This guard exists ` +
        `specifically because Milestone 174B's own test suite once wrote real rows to production this ` +
        `same way — fix the test, never remove or weaken this guard.`
    );
    this.name = "ProductionWriteBlockedError";
  }
}

const MUTATING_MODEL_METHODS = [
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
] as const;

const MUTATING_CLIENT_METHODS = ["$transaction", "$executeRaw", "$executeRawUnsafe"] as const;

// Async (not a synchronous throw) so this behaves exactly like the
// real Prisma method it replaces — a real call site always does
// `await prisma.x.create(...)` or `prisma.x.create(...).catch(...)`,
// never treats the call itself as possibly throwing synchronously.
function blockedFn(target: string, method: string): () => Promise<never> {
  return async () => {
    throw new ProductionWriteBlockedError(target, method);
  };
}

// Installed once, before any test file's own stubs run. Every model
// delegate (prisma.notification, prisma.order, ...) is an own-
// enumerable property of the client whose mutating methods are
// themselves own-enumerable functions — confirmed directly against
// this project's actual @prisma/client build, not assumed. Internal/
// meta properties ($extends, _engine, etc.) are skipped.
export function installProductionWriteGuard(prismaClient: object): void {
  for (const [modelName, delegate] of Object.entries(prismaClient)) {
    if (!delegate || typeof delegate !== "object" || modelName.startsWith("$") || modelName.startsWith("_")) continue;
    for (const method of MUTATING_MODEL_METHODS) {
      if (typeof (delegate as Record<string, unknown>)[method] !== "function") continue;
      (delegate as Record<string, unknown>)[method] = blockedFn(`prisma.${modelName}`, method);
    }
  }

  const client = prismaClient as Record<string, unknown>;
  for (const method of MUTATING_CLIENT_METHODS) {
    if (typeof client[method] !== "function") continue;
    client[method] = blockedFn("prisma", method);
  }
}
