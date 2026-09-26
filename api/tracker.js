const defaultStore = require("./order-store");
const { STATUS_LABELS, bearerToken, verifyTrackerToken, transitionOrder, safeOrder } = require("./tracker-lib");

let store = defaultStore;

function clean(value, max = 200) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

async function sendStatusTelegram(order) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  const params = new URLSearchParams({
    chat_id: chatId,
    text: `🚗 ${order.orderId} → ${STATUS_LABELS[order.status]}\n${order.year || ""} ${order.make || ""} ${order.model || ""}`.trim(),
  });
  const topicId = clean(process.env.TELEGRAM_TOPIC_ID, 20);
  if (topicId) params.set("message_thread_id", topicId);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  return response.ok;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const secret = process.env.TELEGRAM_BOT_TOKEN;
  if (!secret || !verifyTrackerToken(bearerToken(req), secret)) return res.status(401).json({ error: "Tracker link is invalid or expired." });

  try {
    if (req.method === "GET") {
      const orderId = clean(req.query?.order, 40);
      if (orderId) {
        const order = await store.getOrder(orderId);
        return order ? res.status(200).json({ order: safeOrder(order) }) : res.status(404).json({ error: "Order not found." });
      }
      const orders = await store.listOrders();
      return res.status(200).json({ orders: orders.map(safeOrder) });
    }

    if (req.method === "PATCH") {
      const orderId = clean(req.body?.orderId, 40);
      const order = await store.getOrder(orderId);
      if (!order) return res.status(404).json({ error: "Order not found." });
      const updated = transitionOrder(order, req.body?.status, req.body?.note);
      await store.saveOrder(updated);
      let notificationDelivered = true;
      if (req.body?.status) notificationDelivered = await sendStatusTelegram(updated).catch(() => false);
      return res.status(200).json({ order: safeOrder(updated), notificationDelivered });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    const expected = /Next status|already delivered/.test(error.message);
    return res.status(expected ? 409 : 503).json({ error: expected ? error.message : "The private tracker is temporarily unavailable." });
  }
};

module.exports._test = { setStore(value) { store = value; }, resetStore() { store = defaultStore; } };
