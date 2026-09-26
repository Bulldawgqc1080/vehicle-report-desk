const defaultStore = require("./order-store");
const { bearerToken, verifyTrackerToken, transitionOrder, safeOrder } = require("./tracker-lib");
const { emailContent, validateDelivery } = require("./delivery-lib");

let store = defaultStore;
let sendEmail = sendWithResend;

function clean(value, max = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

async function sendWithResend({ order, reportBuffer }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = clean(process.env.REPORT_FROM_EMAIL, 300);
  const replyTo = clean(process.env.REPORT_REPLY_TO || "justin@websitecheckpro.com", 200);
  const bcc = clean(process.env.REPORT_BCC_EMAIL, 200);
  if (!apiKey || !from) throw new Error("Email delivery is not configured.");
  const content = emailContent(order);
  const payload = {
    from,
    to: [order.email],
    reply_to: replyTo,
    subject: content.subject,
    html: content.html,
    text: content.text,
    attachments: [{ filename: order.report.name, content: reportBuffer.toString("base64") }],
    tags: [{ name: "order_id", value: order.orderId.replace(/[^A-Za-z0-9_-]/g, "_") }],
  };
  if (bcc) payload.bcc = [bcc];
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "idempotency-key": `report/${order.orderId}/${order.report.sha256}`.slice(0, 256) },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.id) throw new Error(result.message || "Email provider rejected the delivery.");
  return { id: result.id, from, replyTo, subject: content.subject };
}

async function sendTelegramReceipt(order) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  const body = new URLSearchParams({ chat_id: chatId, text: `✅ ${order.orderId} delivered to ${order.email}\nEmail ID: ${order.delivery.emailId}` });
  const topicId = clean(process.env.TELEGRAM_TOPIC_ID, 20);
  if (topicId) body.set("message_thread_id", topicId);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  return response.ok;
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
    validateDelivery(order, req.body?.confirmEmail);
    const reportBuffer = await store.getPrivateBuffer(order.report.pathname);
    if (!reportBuffer) throw new Error("The final PDF could not be loaded.");
    const sent = await sendEmail({ order, reportBuffer });
    const now = new Date().toISOString();
    const delivered = transitionOrder(order, "DELIVERED", undefined, now, { allowDelivery: true });
    delivered.delivery = { emailId: sent.id, recipient: order.email, from: sent.from, replyTo: sent.replyTo, subject: sent.subject, reportSha256: order.report.sha256, sentAt: now };
    await store.saveOrder(delivered);
    const telegramDelivered = await sendTelegramReceipt(delivered).catch(() => false);
    return res.status(200).json({ order: safeOrder(delivered), telegramDelivered });
  } catch (error) {
    const expected = /Approve|Upload|already been delivered|Type the customer email|not configured|could not be loaded|provider rejected/.test(error.message);
    return res.status(expected ? 409 : 503).json({ error: expected ? error.message : "Delivery failed before the order was marked delivered." });
  }
};

module.exports._test = {
  setStore(value) { store = value; }, resetStore() { store = defaultStore; },
  setSendEmail(value) { sendEmail = value; }, resetSendEmail() { sendEmail = sendWithResend; },
};
