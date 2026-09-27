const test = require("node:test");
const assert = require("node:assert/strict");
const { validateUploadRequest, validateCleanupRequest } = require("../api/upload")._test;

const SESSION = "123e4567-e89b-42d3-a456-426614174000";

test("authorizes only fresh matching pending-intake paths", () => {
  const payload = JSON.stringify({ sessionId: SESSION, startedAt: Date.now() - 5000 });
  assert.deepEqual(validateUploadRequest(`pending-intake/${SESSION}/history.pdf`, payload), { sessionId: SESSION });
  assert.throws(() => validateUploadRequest("pending-intake/other/history.pdf", payload), /does not match/);
  assert.throws(() => validateUploadRequest(`pending-intake/${SESSION}/history.pdf`, "{}"), /Invalid upload session/);
});

test("cleanup is limited to the same fresh pending-upload session", () => {
  const startedAt = Date.now() - 5000;
  const pathname = `pending-intake/${SESSION}/history.pdf`;
  assert.deepEqual(validateCleanupRequest({ payload: { sessionId: SESSION, startedAt, pathnames: [pathname] } }), [pathname]);
  assert.throws(() => validateCleanupRequest({ payload: { sessionId: SESSION, startedAt, pathnames: ["orders/private/report.pdf"] } }), /does not match/);
});
