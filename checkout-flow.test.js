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

test("seller sample exposes the complete three-document kit", () => {
  assert.match(html, /Complete 3-document Sell-Your-Car Kit/);
  assert.match(html, /sample-seller-kit\.pdf/);
  assert.match(html, /sample-seller-strategy-guide\.pdf/);
  assert.match(html, /sample-seller-listing-kit\.pdf/);
  assert.match(html, /sample-seller-highlights-sheet\.pdf/);
});

test("buyer offer, sample, trust, and fulfillment copy stay aligned", () => {
  assert.match(html, /Buying a used car\? Know what to question before you commit\./);
  assert.match(html, /Get my buyer report · \$89/);
  assert.match(html, /Full-history Honda Element decision report/);
  assert.match(html, /Open complete report · 5 pages/);
  assert.match(html, /Independent research, reviewed by a real person/);
  assert.match(html, /One vehicle/);
  assert.match(html, /2–3 business days/);
  assert.match(html, /One clarification round included/);
  assert.doesNotMatch(html, /Listing-only preliminary screen/);
  assert.doesNotMatch(html, /sample Lexus buyer report/);
});

test("homepage no longer exposes the unrelated legacy email brand", () => {
  assert.doesNotMatch(html, /websitecheckpro\.com/);
});

test("analytics and click events are installed without collecting form contents", () => {
  assert.match(html, /\/_vercel\/insights\/script\.js/);
  assert.match(html, /data-track="Buyer checkout"/);
  assert.match(html, /data-track="Seller checkout"/);
});
