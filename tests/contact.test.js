const test = require("node:test");
const assert = require("node:assert/strict");
const { validateContact } = require("../api/contact")._test;

test("validates a presale contact question without accepting spam", () => {
  const valid = validateContact({
    name: "Test Buyer", email: "buyer@example.com", message: "Do I have enough information to order?", startedAt: Date.now() - 5000,
  });
  assert.equal(valid.email, "buyer@example.com");
  assert.throws(() => validateContact({ ...valid, companyWebsite: "spam.example", startedAt: Date.now() - 5000 }), /rejected/);
  assert.throws(() => validateContact({ name: "A", email: "bad", message: "short", startedAt: Date.now() - 5000 }), /name/);
});
