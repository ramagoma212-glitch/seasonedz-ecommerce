// Milestone 202: proves through the real route stack that a STAFF session cannot
// send an individual follow-up email or reconcile an unresolved send, even with a
// direct API request. Preview, composer and queue stay open to any admin.
import { test } from "node:test";
import assert from "node:assert/strict";
import contactRoutes from "./adminOutreachContact.routes.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStack = { stack: any[] };

function routeFor(method: string, path: string) {
  const layer = (contactRoutes as unknown as AnyStack).stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer, `expected ${method.toUpperCase()} ${path} to be registered`);
  return layer.route as { stack: Array<{ handle: (req: unknown, res: unknown, next: () => void) => unknown }> };
}

function fakeResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
    send(body: unknown) {
      response.body = body;
      return response;
    },
    setHeader() {
      return undefined;
    },
  };
  return response;
}

async function runGate(method: string, path: string, role: "ADMIN" | "STAFF") {
  const route = routeFor(method, path);
  const response = fakeResponse();
  let reachedHandler = false;
  const session = { adminUser: { id: `${role.toLowerCase()}-1`, name: role, email: `${role.toLowerCase()}@example.invalid`, role } };
  await route.stack[0]!.handle(session, response, () => {
    reachedHandler = true;
  });
  return { response, reachedHandler };
}

for (const [method, path] of [
  ["post", "/:id/follow-up/send"],
  ["post", "/:id/follow-up/attempts/:attemptId/reconcile"],
] as const) {
  test(`STAFF is refused ${method.toUpperCase()} ${path} on the server, before the handler runs`, async () => {
    const { response, reachedHandler } = await runGate(method, path, "STAFF");
    assert.equal(response.statusCode, 403);
    assert.equal(reachedHandler, false);
  });

  test(`ADMIN passes the gate for ${method.toUpperCase()} ${path}`, async () => {
    const { reachedHandler } = await runGate(method, path, "ADMIN");
    assert.equal(reachedHandler, true);
  });
}

test("the send route runs the role gate and the outreach rate limiter before the handler", () => {
  const route = routeFor("post", "/:id/follow-up/send");
  assert.equal(route.stack.length, 3, "role gate, rate limiter, then the handler");
});

test("preview, composer and queue are open to any admin, with no role gate", () => {
  assert.equal(routeFor("post", "/:id/follow-up/preview").stack.length, 1);
  assert.equal(routeFor("get", "/:id/follow-up").stack.length, 1);
  assert.equal(routeFor("get", "/follow-up-queue").stack.length, 1);
});

test("the queue route is registered before the /:id parameter route so it is never shadowed", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stack = (contactRoutes as unknown as AnyStack).stack as any[];
  const queueIndex = stack.findIndex((entry) => entry.route?.path === "/follow-up-queue");
  const byIdIndex = stack.findIndex((entry) => entry.route?.path === "/:id");
  assert.ok(queueIndex !== -1 && queueIndex < byIdIndex);
});
