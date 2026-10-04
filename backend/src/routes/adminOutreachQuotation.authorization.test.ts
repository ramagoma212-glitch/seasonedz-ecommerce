// Milestone 201: proves, through the real route stack, that a STAFF session
// cannot perform the financially consequential quotation actions even with a
// direct API request. The frontend hiding a button is never the control: these
// tests invoke the server-side gate itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import quotationRoutes from "./adminOutreachQuotation.routes.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStack = { stack: any[] };

function routeFor(method: string, path: string) {
  const layer = (quotationRoutes as unknown as AnyStack).stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
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

function sessionWithRole(role: "ADMIN" | "STAFF") {
  return { adminUser: { id: `${role.toLowerCase()}-1`, name: role, email: `${role.toLowerCase()}@example.invalid`, role } };
}

// Runs the route's first layer. For a consequential route that is the role
// gate. It must either refuse (never calling next) or pass straight through.
async function runFirstLayer(method: string, path: string, role: "ADMIN" | "STAFF") {
  const route = routeFor(method, path);
  const response = fakeResponse();
  let reachedHandler = false;
  await route.stack[0]!.handle(sessionWithRole(role), response, () => {
    reachedHandler = true;
  });
  return { response, reachedHandler };
}

const CONSEQUENTIAL = [
  ["post", "/:id/send"],
  ["post", "/:id/reconcile"],
  ["post", "/:id/accept"],
  ["post", "/:id/decline"],
  ["post", "/:id/expire"],
  ["post", "/:id/cancel"],
] as const;

for (const [method, path] of CONSEQUENTIAL) {
  test(`STAFF is refused ${method.toUpperCase()} ${path} on the server, before any handler runs`, async () => {
    const { response, reachedHandler } = await runFirstLayer(method, path, "STAFF");
    assert.equal(response.statusCode, 403);
    assert.equal(reachedHandler, false, "the send/accept/decline/cancel handler must never be reached");
    assert.match(String((response.body as { message?: string })?.message ?? ""), /permission/i);
  });

  test(`ADMIN passes the gate for ${method.toUpperCase()} ${path}`, async () => {
    const { reachedHandler, response } = await runFirstLayer(method, path, "ADMIN");
    assert.equal(reachedHandler, true);
    assert.equal(response.statusCode, 200, "the gate itself must not respond for an admin");
  });
}

test("consequential routes carry the role gate as their first layer, not as an afterthought", () => {
  for (const [method, path] of CONSEQUENTIAL) {
    assert.equal(routeFor(method, path).stack.length, 2, `${method.toUpperCase()} ${path} must be gate + handler`);
  }
});

test("drafting, editing, duplicating and viewing stay open to STAFF, with no role gate", () => {
  const open: Array<[string, string]> = [
    ["post", "/"],
    ["patch", "/:id"],
    ["post", "/:id/duplicate"],
    ["get", "/:id/pdf"],
    ["get", "/:id"],
    ["get", "/"],
  ];
  for (const [method, path] of open) {
    assert.equal(routeFor(method, path).stack.length, 1, `${method.toUpperCase()} ${path} must not be role-gated`);
  }
});
