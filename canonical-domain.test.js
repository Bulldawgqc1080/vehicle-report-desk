const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync("canonical-domain.js", "utf8");

function runFor(url) {
  let redirectedTo = null;
  const parsed = new URL(url);
  const window = {
    location: {
      href: parsed.href,
      hostname: parsed.hostname,
      replace(destination) {
        redirectedTo = destination;
      }
    }
  };

  vm.runInNewContext(source, { URL, window });
  return redirectedTo;
}

test("replaces the Vercel fallback hostname and preserves the full URL", () => {
  assert.equal(
    runFor("https://vehicle-report-desk.vercel.app/tracker?order=123#token"),
    "https://www.vehiclereportdesk.com/tracker?order=123#token"
  );
});

test("does nothing on the canonical hostname", () => {
  assert.equal(runFor("https://www.vehiclereportdesk.com/#top"), null);
});
