const defaultStore = require("./order-store");
const { bearerToken, verifyTrackerToken, safeOrder } = require("./tracker-lib");
const { decodeReport } = require("./delivery-lib");

let store = defaultStore;

function clean(value, max = 200) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const secret = process.env.TELEGRAM_BOT_TOKEN;
  if (!secret || !verifyTrackerToken(bearerToken(req), secret)) return res.status(401).json({ error: "Tracker link is invalid or expired." });
  try {
    const orderId = clean(req.body?.orderId, 40);
    const order = await store.getOrder(orderId);
    if (!order) return res.status(404).json({ error: "Order not found." });
    if (!["PAYMENT_VERIFIED", "RESEARCHING", "REPORT_READY"].includes(order.status)) return res.status(409).json({ error: "Reports can only be uploaded before final approval." });
    const file = decodeReport(req.body?.file);
    const report = await store.saveReport(orderId, file);
    const now = new Date().toISOString();
    const updated = {
      ...order,
      report,
      updatedAt: now,
      timeline: [...(order.timeline || []), { status: "PDF_UPLOADED", at: now, source: "operator", sha256: report.sha256 }],
    };
    await store.saveOrder(updated);
    return res.status(200).json({ order: safeOrder(updated) });
  } catch (error) {
    const expected = /PDF|uploaded file/.test(error.message);
    return res.status(expected ? 400 : 503).json({ error: expected ? error.message : "The report could not be stored." });
  }
};

module.exports._test = { setStore(value) { store = value; }, resetStore() { store = defaultStore; } };
