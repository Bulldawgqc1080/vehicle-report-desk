const test = require("node:test");
const assert = require("node:assert/strict");
const { validateVin, normalizeVin, validatePayload, buildTelegramMessage } = require("./intake")._test;
const handler = require("./intake");

test("validates and normalizes real VIN input", () => {
  const vin = normalizeVin("5j6yh275x3l050944");
  assert.equal(vin, "5J6YH275X3L050944");
  assert.equal(validateVin(vin).valid, true);
  assert.equal(validateVin("5J6YH27503L050944").valid, false);
});

test("rejects an intake without required acknowledgments", () => {
  assert.throws(() => validatePayload({ service: "Buyer Decision Report", name: "Test Buyer", email: "buyer@example.com", concerns: "Should I inspect it?", startedAt: Date.now() - 5000 }), /acknowledgments/);
});

test("produces a bounded private-order summary", () => {
  const message = buildTelegramMessage("VRD-20260925-ABC123", {
    service: "Buyer Decision Report", name: "Test Buyer", email: "buyer@example.com", phone: "", year: "2003", make: "Honda", model: "Element",
    vin: "5J6YH275X3L050944", mileage: "128137", price: "6500", location: "Mesa, AZ", titleStatus: "Unknown",
    listing: "https://example.com/listing", concerns: "Rust?", sellerClaims: "Transmission repaired", evidence: ["History report"], files: [],
  });
  assert.match(message, /VRD-20260925-ABC123/);
  assert.match(message, /Match the customer email against Stripe/);
  assert.ok(message.length <= 4096);
});

test("accepts a valid intake and calls the private notification adapter", async () => {
  const priorToken = process.env.TELEGRAM_BOT_TOKEN;
  const priorChat = process.env.TELEGRAM_CHAT_ID;
  const priorFetch = global.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_CHAT_ID = "123456";
  let telegramCalls = 0;
  global.fetch = async () => { telegramCalls += 1; return { ok: true }; };
  const req = {
    method: "POST",
    headers: { "x-forwarded-for": "192.0.2.44" },
    body: {
      service: "Buyer Decision Report", name: "Test Buyer", email: "buyer@example.com",
      vin: "5J6YH275X3L050944", concerns: "Should I inspect it?",
      startedAt: Date.now() - 5000, termsAccepted: true, redactionAccepted: true, files: [],
    },
  };
  const res = {
    statusCode: 200, body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  try {
    await handler(req, res);
    assert.equal(res.statusCode, 201);
    assert.match(res.body.orderId, /^VRD-\d{8}-[A-F0-9]{6}$/);
    assert.equal(telegramCalls, 1);
  } finally {
    global.fetch = priorFetch;
    if (priorToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = priorToken;
    if (priorChat === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = priorChat;
  }
});
