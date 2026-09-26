const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");

test("primary start paths send customers to pricing before intake", () => {
  assert.match(html, /class="nav-cta" href="#pricing"/);
  assert.doesNotMatch(html, /class="nav-cta" href="#start"/);
  assert.match(html, /Step 2 of 2 · after checkout/);
  assert.match(html, /Submit paid order details/);
});

test("consent copy is wrapped as one flex item on mobile", () => {
  assert.match(html, /id="redaction-accepted"[^>]*><span>/);
  assert.match(html, /id="terms-accepted"[^>]*><span>/);
});
