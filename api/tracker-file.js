const store = require("./order-store");
const { Readable } = require("node:stream");
const { bearerToken, verifyTrackerToken } = require("./tracker-lib");

function clean(value, max = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  const secret = process.env.TELEGRAM_BOT_TOKEN;
  if (!secret || !verifyTrackerToken(bearerToken(req), secret)) return res.status(401).json({ error: "Tracker link is invalid or expired." });

  try {
    const orderId = clean(req.query?.order, 40);
    const fileId = clean(req.query?.file, 500);
    const order = await store.getOrder(orderId);
    const file = order?.files?.find((item) => item.pathname === fileId);
    if (!file) return res.status(404).json({ error: "Attachment not found." });
    const result = await store.getPrivateFile(file.pathname);
    if (!result || result.statusCode !== 200) return res.status(404).json({ error: "Attachment not found." });
    res.setHeader("Content-Type", file.type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${file.name.replace(/["\\]/g, "-")}"`);
    return Readable.fromWeb(result.stream).pipe(res);
  } catch {
    return res.status(503).json({ error: "Attachment is temporarily unavailable." });
  }
};
