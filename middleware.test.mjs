import assert from "node:assert/strict";
import test from "node:test";

import { canonicalRedirectTarget } from "./canonical-redirect.mjs";

test("redirects the Vercel fallback host to the canonical domain", () => {
  const destination = canonicalRedirectTarget(
    "https://vehicle-report-desk.vercel.app/tracker?order=123"
  );

  assert.equal(
    destination,
    "https://www.vehiclereportdesk.com/tracker?order=123"
  );
});

test("allows the canonical host to continue normally", () => {
  const destination = canonicalRedirectTarget(
    "https://www.vehiclereportdesk.com/tracker"
  );

  assert.equal(destination, null);
});
