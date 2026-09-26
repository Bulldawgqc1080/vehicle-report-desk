const crypto = require("node:crypto");

const MAX_REPORT_BYTES = 3 * 1024 * 1024;

function clean(value, max = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function escapeHtml(value) {
  return clean(value, 5000).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function decodeReport(file) {
  const name = clean(file?.name, 140);
  const type = clean(file?.type, 80).toLowerCase();
  const data = clean(file?.data, 4_500_000);
  if (!name || !name.toLowerCase().endsWith(".pdf") || !["", "application/pdf", "application/octet-stream"].includes(type) || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error("Select a valid PDF report.");
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length || buffer.length > MAX_REPORT_BYTES) throw new Error("The final PDF must be 3 MB or smaller.");
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("The uploaded file is not a valid PDF.");
  return { name, type: "application/pdf", buffer, sha256: crypto.createHash("sha256").update(buffer).digest("hex") };
}

function emailContent(order) {
  const firstName = clean(order.name, 120).split(/\s+/)[0] || "there";
  const vehicle = [order.year, order.make, order.model].filter(Boolean).join(" ") || "vehicle";
  const subject = `Your ${order.service} — ${vehicle}`;
  const text = [
    `Hi ${firstName},`, "", `Your ${order.service} for the ${vehicle} is attached.`,
    `Order reference: ${order.orderId}`, "",
    "Please read the evidence labels, unknowns, and inspection priorities before making a decision.",
    "This report is research and decision support—not a mechanical inspection, title guarantee, certification, appraisal, or warranty.", "",
    "Questions? Reply to this email.", "", "Vehicle Report Desk",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f3f1eb;font-family:Arial,sans-serif;color:#1d2c23"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#183c2a;color:#fff;padding:22px 26px;border-radius:12px 12px 0 0"><strong style="font-size:20px">Vehicle Report Desk</strong></div><div style="background:#fff;padding:28px 26px;border:1px solid #dcd9d1;border-top:0;border-radius:0 0 12px 12px"><p>Hi ${escapeHtml(firstName)},</p><h1 style="font-size:24px;line-height:1.25">Your report is ready.</h1><p>Your <strong>${escapeHtml(order.service)}</strong> for the <strong>${escapeHtml(vehicle)}</strong> is attached.</p><p style="padding:12px;background:#eef2eb;border-radius:8px"><strong>Order reference:</strong> ${escapeHtml(order.orderId)}</p><p>Please read the evidence labels, unknowns, and inspection priorities before making a decision.</p><p style="font-size:13px;color:#5e675f;border-top:1px solid #e3e0d9;padding-top:16px">This report is research and decision support—not a mechanical inspection, title guarantee, certification, appraisal, or warranty.</p><p>Questions? Reply to this email.</p><p><strong>Vehicle Report Desk</strong></p></div></div></body></html>`;
  return { subject, text, html };
}

function validateDelivery(order, confirmEmail) {
  if (order.status !== "APPROVED") throw new Error("Approve the report before delivery.");
  if (!order.report?.pathname) throw new Error("Upload the final PDF before delivery.");
  if (order.delivery?.emailId) throw new Error("This report has already been delivered.");
  if (clean(confirmEmail, 200).toLowerCase() !== clean(order.email, 200).toLowerCase()) throw new Error("Type the customer email exactly to confirm delivery.");
}

module.exports = { MAX_REPORT_BYTES, decodeReport, emailContent, validateDelivery };
