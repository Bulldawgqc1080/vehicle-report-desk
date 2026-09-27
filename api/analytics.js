const crypto = require("node:crypto");

const ALLOWED_EVENTS = new Set([
  "page_view",
  "Buyer hero CTA",
  "Buyer sample hero",
  "Buyer sample section",
  "Buyer checkout",
  "Seller checkout",
  "intake_submit",
  "intake_received",
  "payment_success_return",
]);
const recentEvents = new Map();

function clean(value, max = 120) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function validateEvent(body) {
  const event = clean(body?.event, 80);
  const path = clean(body?.path || "/", 120);
  if (!ALLOWED_EVENTS.has(event)) throw new Error("Invalid analytics event.");
  if (!/^\/[A-Za-z0-9/_-]*$/.test(path)) throw new Error("Invalid analytics path.");
  return { event, path };
}

async function storeEvent(event) {
  const { put } = await import("@vercel/blob");
  const timestamp = new Date().toISOString();
  const day = timestamp.slice(0, 10);
  const id = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
  await put(`analytics/${day}/${id}.json`, JSON.stringify({ ...event, timestamp }), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const site = clean(req.headers["sec-fetch-site"], 20);
  if (site && !["same-origin", "same-site"].includes(site)) return res.status(403).json({ error: "Cross-site event rejected." });
  const source = clean(req.headers["x-forwarded-for"], 200).split(",")[0] || "unknown";
  const now = Date.now();
  const windowEvents = (recentEvents.get(source) || []).filter((time) => now - time < 60_000);
  if (windowEvents.length >= 20) return res.status(429).json({ error: "Event limit reached." });
  try {
    const event = validateEvent(req.body || {});
    await storeEvent(event);
    recentEvents.set(source, [...windowEvents, now]);
    return res.status(202).json({ accepted: true });
  } catch (error) {
    const expected = /Invalid analytics/.test(error.message);
    return res.status(expected ? 400 : 503).json({ error: expected ? error.message : "Analytics unavailable." });
  }
};

module.exports._test = { validateEvent };
