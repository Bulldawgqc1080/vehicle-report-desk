const recentSubmissions = new Map();

function clean(value, max = 2000) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function escapeHtml(value) {
  return clean(value, 4000).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function validateContact(body) {
  const name = clean(body.name, 120);
  const email = clean(body.email, 200).toLowerCase();
  const message = clean(body.message, 2000);
  const elapsed = Date.now() - Number(body.startedAt || 0);
  if (clean(body.companyWebsite, 100)) throw new Error("Submission rejected.");
  if (!Number.isFinite(elapsed) || elapsed < 2500) throw new Error("Please review your message and submit again.");
  if (name.length < 2) throw new Error("Enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (message.length < 10) throw new Error("Please include a little more detail in your question.");
  return { name, email, message };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const forwarded = clean(req.headers["x-forwarded-for"], 200).split(",")[0] || "unknown";
  const now = Date.now();
  if (now - (recentSubmissions.get(forwarded) || 0) < 60_000) return res.status(429).json({ error: "Please wait before sending another question." });
  try {
    const data = validateContact(req.body || {});
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) throw new Error("Contact notifications are not configured.");
    const form = new URLSearchParams({
      chat_id: chatId,
      parse_mode: "HTML",
      disable_web_page_preview: "true",
      text: ["❓ <b>Vehicle Report Desk question</b>", `<b>From:</b> ${escapeHtml(data.name)}`, `<b>Email:</b> ${escapeHtml(data.email)}`, "", escapeHtml(data.message)].join("\n"),
    });
    const topicId = clean(process.env.TELEGRAM_TOPIC_ID, 20);
    if (topicId) form.set("message_thread_id", topicId);
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", body: form, headers: { "content-type": "application/x-www-form-urlencoded" } });
    if (!response.ok) throw new Error("Contact notification failed.");
    recentSubmissions.set(forwarded, now);
    return res.status(202).json({ accepted: true });
  } catch (error) {
    const expected = /Enter |Please |rejected/.test(error.message);
    return res.status(expected ? 400 : 503).json({ error: expected ? error.message : "Your question could not be delivered. Please try again." });
  }
};

module.exports._test = { validateContact };
