const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("./tracker");
const { trackerToken, verifyTrackerToken, nextStatus, transitionOrder } = require("./tracker-lib");

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function sampleOrder() {
  return {
    orderId: "VRD-20260926-ABC123",
    status: "INTAKE_RECEIVED",
    service: "Buyer Decision Report",
    name: "Test Buyer",
    email: "buyer@example.com",
    files: [],
    timeline: [{ status: "INTAKE_RECEIVED", at: "2026-09-26T00:00:00.000Z", source: "customer" }],
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
  };
}

test("creates and verifies a stable tracker token", () => {
  const token = trackerToken("secret-bot-token");
  assert.equal(verifyTrackerToken(token, "secret-bot-token"), true);
  assert.equal(verifyTrackerToken(token, "different-secret"), false);
});

test("enforces one-way order transitions and both manual gates", () => {
  assert.equal(nextStatus("INTAKE_RECEIVED"), "PAYMENT_VERIFIED");
  assert.equal(nextStatus("REPORT_READY"), "APPROVED");
  assert.throws(() => transitionOrder(sampleOrder(), "RESEARCHING"), /Next status must be PAYMENT_VERIFIED/);
  const verified = transitionOrder(sampleOrder(), "PAYMENT_VERIFIED", undefined, "2026-09-26T01:00:00.000Z");
  assert.equal(verified.status, "PAYMENT_VERIFIED");
  assert.equal(verified.timeline.at(-1).source, "operator");
});

test("rejects tracker requests without the signed bearer token", async () => {
  const priorSecret = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "test-secret";
  const res = response();
  try {
    await handler({ method: "GET", headers: {}, query: {} }, res);
    assert.equal(res.statusCode, 401);
  } finally {
    if (priorSecret === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = priorSecret;
  }
});

test("lists private orders and persists the next valid status", async () => {
  const priorSecret = process.env.TELEGRAM_BOT_TOKEN;
  const priorChat = process.env.TELEGRAM_CHAT_ID;
  const priorFetch = global.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test-secret";
  delete process.env.TELEGRAM_CHAT_ID;
  let order = sampleOrder();
  handler._test.setStore({
    async listOrders() { return [order]; },
    async getOrder() { return order; },
    async saveOrder(value) { order = value; return value; },
  });
  global.fetch = async () => ({ ok: true });
  const headers = { authorization: `Bearer ${trackerToken("test-secret")}` };
  try {
    const listRes = response();
    await handler({ method: "GET", headers, query: {} }, listRes);
    assert.equal(listRes.statusCode, 200);
    assert.equal(listRes.body.orders[0].orderId, order.orderId);

    const updateRes = response();
    await handler({ method: "PATCH", headers, body: { orderId: order.orderId, status: "PAYMENT_VERIFIED" } }, updateRes);
    assert.equal(updateRes.statusCode, 200);
    assert.equal(updateRes.body.order.status, "PAYMENT_VERIFIED");
  } finally {
    handler._test.resetStore();
    global.fetch = priorFetch;
    if (priorSecret === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = priorSecret;
    if (priorChat === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = priorChat;
  }
});
