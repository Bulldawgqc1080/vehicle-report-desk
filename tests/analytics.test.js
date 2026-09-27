const test = require("node:test");
const assert = require("node:assert/strict");
const { validateEvent } = require("../api/analytics")._test;

test("accepts only bounded conversion events and paths", () => {
  assert.deepEqual(validateEvent({ event: "Buyer checkout", path: "/" }), { event: "Buyer checkout", path: "/" });
  assert.deepEqual(validateEvent({ event: "intake_received", path: "/success" }), { event: "intake_received", path: "/success" });
  assert.throws(() => validateEvent({ event: "customer@example.com", path: "/" }), /Invalid analytics event/);
  assert.throws(() => validateEvent({ event: "page_view", path: "https://other.example/" }), /Invalid analytics path/);
});
