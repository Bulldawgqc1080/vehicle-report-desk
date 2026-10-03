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
  assert.match(html, /Open complete report · 6 pages/);
  assert.match(html, /Hi, I’m Justin\./);
  assert.match(html, /20 years serving as a firefighter in Arizona/);
  assert.match(html, /husband and dad to three daughters/);
  assert.match(html, /personally review every report/);
  assert.match(html, /One vehicle/);
  assert.match(html, /within 2 business days/);
  assert.match(html, /One follow-up included—send questions within 7 days of delivery/);
  assert.doesNotMatch(html, /Listing-only preliminary screen/);
  assert.doesNotMatch(html, /sample Lexus buyer report/);
});

test("homepage no longer exposes the unrelated legacy email brand", () => {
  assert.doesNotMatch(html, /websitecheckpro\.com/);
});

test("analytics and click events are installed without collecting form contents", () => {
  assert.match(html, /data-track="Buyer checkout"/);
  assert.match(html, /data-track="Seller checkout"/);
  assert.doesNotMatch(html, /\/_vercel\/insights\/script\.js/);
});

test("live checkouts and early trust copy stay aligned to Vehicle Report Desk", () => {
  assert.match(html, /https:\/\/buy\.stripe\.com\/3cI8wPbEvcdj16temcgEg00/);
  assert.match(html, /https:\/\/buy\.stripe\.com\/fZueVdeQH2CJ4iFfqggEg01/);
  assert.match(html, /We research the listing, explain the risks, and help you decide what to ask and inspect\. CARFAX or AutoCheck purchases are separate\./);
  assert.match(html, /Personally reviewed by Justin, an Arizona firefighter and independent vehicle researcher\./);
  assert.doesNotMatch(html, /fZu6ozgVO6nDcAZ9DD93y03/);
  assert.doesNotMatch(html, /6oUaEP20U8vL44t7vv93y04/);
});

test("social previews use a dedicated large branded image", () => {
  assert.match(html, /property="og:image" content="https:\/\/www\.vehiclereportdesk\.com\/assets\/images\/social-preview\.png\?v=20261002"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:image" content="https:\/\/www\.vehiclereportdesk\.com\/assets\/images\/social-preview\.png\?v=20261002"/);
});

test("presale contact, research proof, and direct upload limits are visible", () => {
  assert.match(html, /Questions before ordering\?/);
  assert.match(html, /id="contact-form"/);
  assert.match(html, /A source should change the decision/);
  assert.match(html, /Registration history/);
  assert.match(html, /Long-term registration in a road-salt region makes structural corrosion a priority for inspection/);
  assert.match(html, /Upload up to 5 files\. Maximum 10 MB per file and 25 MB total\./);
});
