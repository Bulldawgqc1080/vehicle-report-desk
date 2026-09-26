import assert from "node:assert/strict";
import test from "node:test";

import middleware from "./middleware.mjs";

test("redirects the Vercel fallback host to the canonical domain", () => {
  const response = middleware(
    new Request("https://vehicle-report-desk.vercel.app/tracker?order=123")
  );

  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("location"),
    "https://www.vehiclereportdesk.com/tracker?order=123"
  );
});

test("allows the canonical host to continue normally", () => {
  const response = middleware(
    new Request("https://www.vehiclereportdesk.com/tracker")
  );

  assert.equal(response.headers.get("x-middleware-next"), "1");
});
