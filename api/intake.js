const crypto = require("node:crypto");
const defaultStore = require("./order-store");
const { trackerUrl } = require("./tracker-lib");

let store = defaultStore;

const MAX_FILES = 3;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 2500 * 1024;
const ALLOWED_FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const SERVICES = new Set(["Buyer Decision Report", "Seller Transparency Packet"]);
const recentSubmissions = new Map();

function clean(value, max = 2000) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function escapeHtml(value) {
  return clean(value, 4000).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function normalizeVin(value) {
  return clean(value, 17).replace(/\s+/g, "").toUpperCase();
}

function validateVin(vin) {
  if (!vin) return { valid: true, message: "Not supplied" };
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return { valid: false, message: "VIN must be 17 characters and cannot contain I, O, or Q." };
  const map = { A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9 };
  const weights = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
  const total = [...vin].reduce((sum, char, index) => sum + (/\d/.test(char) ? Number(char) : map[char]) * weights[index], 0);
  const remainder = total % 11;
  const expected = remainder === 10 ? "X" : String(remainder);
  return vin[8] === expected ? { valid: true, message: "Check digit valid" } : { valid: false, message: `VIN check digit should be ${expected}.` };
}

function decodeFile(file) {
  const name = clean(file?.name, 120);
  const type = clean(file?.type, 80).toLowerCase();
  const data = clean(file?.data, 2_000_000);
  if (!name || !ALLOWED_FILE_TYPES.has(type) || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error("Each attachment must be a PDF, JPG, PNG, or WebP file.");
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw new Error("Each attachment must be 1 MB or smaller.");
  return { name, type, buffer };
}

function validatePayload(body) {
  const service = clean(body.service, 80);
  const name = clean(body.name, 120);
  const email = clean(body.email, 200).toLowerCase();
  const vin = normalizeVin(body.vin);
  const vinResult = validateVin(vin);
  const elapsed = Date.now() - Number(body.startedAt || 0);
  if (clean(body.companyWebsite, 100)) throw new Error("Submission rejected.");
  if (!Number.isFinite(elapsed) || elapsed < 2500) throw new Error("Please review the form and submit again.");
  if (!SERVICES.has(service)) throw new Error("Select a valid report service.");
  if (name.length < 2) throw new Error("Enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (!vinResult.valid) throw new Error(vinResult.message);
  if (!body.termsAccepted || !body.redactionAccepted) throw new Error("Required acknowledgments are missing.");
  const files = Array.isArray(body.files) ? body.files.map(decodeFile) : [];
  if (files.length > MAX_FILES) throw new Error(`Attach no more than ${MAX_FILES} files.`);
  if (files.reduce((sum, file) => sum + file.buffer.length, 0) > MAX_TOTAL_FILE_BYTES) throw new Error("Combined attachments must be 2.5 MB or smaller.");
  return {
    service, name, email, vin, files,
    phone: clean(body.phone, 40), listing: clean(body.listing, 1200), year: clean(body.year, 4),
    make: clean(body.make, 80), model: clean(body.model, 80), mileage: clean(body.mileage, 30),
    price: clean(body.price, 30), location: clean(body.location, 120), titleStatus: clean(body.titleStatus, 80),
    concerns: clean(body.concerns, 2500), sellerClaims: clean(body.sellerClaims, 2500),
    evidence: Array.isArray(body.evidence) ? body.evidence.map((item) => clean(item, 80)).slice(0, 12) : [],
  };
}

function orderId() {
  return `VRD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function buildTelegramMessage(order, data) {
  const value = (item) => escapeHtml(item || "Not supplied");
  return [
    "🚗 <b>New Vehicle Report Intake</b>", `<b>Order:</b> <code>${order}</code>`, `<b>Service:</b> ${value(data.service)}`,
    `<b>Customer:</b> ${value(data.name)}`, `<b>Email:</b> ${value(data.email)}`, `<b>Phone:</b> ${value(data.phone)}`, "",
    `<b>Vehicle:</b> ${value([data.year, data.make, data.model].filter(Boolean).join(" "))}`, `<b>VIN:</b> <code>${value(data.vin)}</code>`,
    `<b>Mileage:</b> ${value(data.mileage)}`, `<b>Asking price:</b> ${value(data.price)}`, `<b>Location:</b> ${value(data.location)}`,
    `<b>Title status:</b> ${value(data.titleStatus)}`, `<b>Listing:</b> ${value(data.listing)}`, "",
    `<b>Main concerns:</b> ${value(data.concerns)}`, `<b>Seller claims / known issues:</b> ${value(data.sellerClaims)}`,
    `<b>Evidence available:</b> ${value(data.evidence.join(", "))}`, `<b>Attachments:</b> ${data.files.length}`, "",
    "⚠️ Match the customer email against Stripe before research begins.", "<b>Status:</b> INTAKE RECEIVED — PAYMENT NOT YET VERIFIED",
  ].join("\n").slice(0, 4096);
}

async function telegramCall(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", body,
    headers: body instanceof URLSearchParams ? { "content-type": "application/x-www-form-urlencoded" } : undefined,
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed with ${response.status}.`);
}

async function notifyTelegram(order, data, privateTrackerUrl) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error("Order notifications are not configured.");
  const topicId = clean(process.env.TELEGRAM_TOPIC_ID, 20);
  const message = new URLSearchParams({
    chat_id: chatId,
    text: buildTelegramMessage(order, data),
    parse_mode: "HTML",
    disable_web_page_preview: "true",
    reply_markup: JSON.stringify({ inline_keyboard: [[{ text: "Open private order tracker", url: privateTrackerUrl }]] }),
  });
  if (topicId) message.set("message_thread_id", topicId);
  await telegramCall(token, "sendMessage", message);
  for (const file of data.files) {
    const form = new FormData();
    form.set("chat_id", chatId);
    if (topicId) form.set("message_thread_id", topicId);
    form.set("caption", `${order} · ${file.name}`.slice(0, 1024));
    form.set("document", new Blob([file.buffer], { type: file.type }), file.name);
    await telegramCall(token, "sendDocument", form);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const forwarded = clean(req.headers["x-forwarded-for"], 200).split(",")[0] || "unknown";
  const now = Date.now();
  if (now - (recentSubmissions.get(forwarded) || 0) < 30_000) return res.status(429).json({ error: "Please wait before submitting again." });
  try {
    const data = validatePayload(req.body || {});
    const order = orderId();
    const nowIso = new Date().toISOString();
    const record = {
      orderId: order,
      status: "INTAKE_RECEIVED",
      service: data.service,
      name: data.name,
      email: data.email,
      phone: data.phone,
      listing: data.listing,
      vin: data.vin,
      year: data.year,
      make: data.make,
      model: data.model,
      mileage: data.mileage,
      price: data.price,
      location: data.location,
      titleStatus: data.titleStatus,
      concerns: data.concerns,
      sellerClaims: data.sellerClaims,
      evidence: data.evidence,
      operatorNote: "",
      createdAt: nowIso,
      updatedAt: nowIso,
      timeline: [{ status: "INTAKE_RECEIVED", at: nowIso, source: "customer" }],
    };
    await store.saveNewOrder(record, data.files);
    await notifyTelegram(order, data, trackerUrl(req, process.env.TELEGRAM_BOT_TOKEN));
    recentSubmissions.set(forwarded, now);
    return res.status(201).json({ orderId: order, message: "Vehicle details received." });
  } catch (error) {
    const expected = /Enter |Select |VIN |attachment|acknowledgment|review|rejected|no more|Combined/.test(error.message);
    return res.status(expected ? 400 : 503).json({ error: expected ? error.message : "We could not deliver your intake. Please try again or email support." });
  }
};

module.exports._test = {
  validateVin, normalizeVin, validatePayload, buildTelegramMessage,
  setStore(value) { store = value; },
  resetStore() { store = defaultStore; },
};
