const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const recentTokens = new Map();

function clean(value, max = 200) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function validateUploadRequest(pathname, clientPayload) {
  let payload;
  try { payload = JSON.parse(clientPayload || "{}"); } catch { throw new Error("Invalid upload session."); }
  const sessionId = clean(payload.sessionId, 40);
  const elapsed = Date.now() - Number(payload.startedAt || 0);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) throw new Error("Invalid upload session.");
  if (!Number.isFinite(elapsed) || elapsed < 2500 || elapsed > 2 * 60 * 60 * 1000) throw new Error("Upload session expired. Reload the page and try again.");
  if (!String(pathname).startsWith(`pending-intake/${sessionId}/`)) throw new Error("Upload path does not match the intake session.");
  return { sessionId };
}

function validateCleanupRequest(body) {
  const sessionId = clean(body?.payload?.sessionId, 40);
  const startedAt = body?.payload?.startedAt;
  const pathnames = Array.isArray(body?.payload?.pathnames) ? body.payload.pathnames.slice(0, 5) : [];
  if (!pathnames.length) throw new Error("No pending uploads supplied.");
  for (const pathname of pathnames) validateUploadRequest(pathname, JSON.stringify({ sessionId, startedAt }));
  return pathnames;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const forwarded = clean(req.headers["x-forwarded-for"], 200).split(",")[0] || "unknown";
  const now = Date.now();
  const recent = (recentTokens.get(forwarded) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 8) return res.status(429).json({ error: "Too many upload requests. Please wait a minute." });
  try {
    if (req.body?.type === "cleanup-pending-uploads") {
      const pathnames = validateCleanupRequest(req.body);
      const { del } = await import("@vercel/blob");
      await del(pathnames);
      return res.status(200).json({ removed: pathnames.length });
    }
    const [{ handleUploadPresigned }, { issueSignedToken }] = await Promise.all([
      import("@vercel/blob/client"),
      import("@vercel/blob"),
    ]);
    const response = await handleUploadPresigned({
      body: req.body,
      request: req,
      getSignedToken: async (pathname, clientPayload) => {
        validateUploadRequest(pathname, clientPayload);
        recentTokens.set(forwarded, [...recent, now]);
        const validUntil = Date.now() + 15 * 60 * 1000;
        return {
          token: await issueSignedToken({
            pathname,
            operations: ["put"],
            allowedContentTypes: ALLOWED_FILE_TYPES,
            maximumSizeInBytes: MAX_FILE_BYTES,
            validUntil,
          }),
          urlOptions: {
            allowedContentTypes: ALLOWED_FILE_TYPES,
            maximumSizeInBytes: MAX_FILE_BYTES,
            validUntil,
            addRandomSuffix: true,
          },
        };
      },
    });
    return res.status(200).json(response);
  } catch (error) {
    console.error("Upload authorization failed:", error);
    return res.status(400).json({ error: /upload session|Upload path|Too many/i.test(error.message) ? error.message : "Secure upload could not be authorized." });
  }
};

module.exports._test = { validateUploadRequest, validateCleanupRequest };
