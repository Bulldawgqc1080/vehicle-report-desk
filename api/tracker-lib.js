const crypto = require("node:crypto");

const STATUSES = [
  "INTAKE_RECEIVED",
  "PAYMENT_VERIFIED",
  "RESEARCHING",
  "REPORT_READY",
  "APPROVED",
  "DELIVERED",
];

const STATUS_LABELS = {
  INTAKE_RECEIVED: "Intake Received",
  PAYMENT_VERIFIED: "Payment Verified",
  RESEARCHING: "Researching",
  REPORT_READY: "Report Ready",
  APPROVED: "Approved for Delivery",
  DELIVERED: "Delivered",
};

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function trackerToken(secret) {
  if (!secret) throw new Error("Tracker signing secret is unavailable.");
  return sign("vehicle-report-desk:tracker:v1", secret);
}

function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyTrackerToken(token, secret) {
  return timingSafeEqual(token, trackerToken(secret));
}

function bearerToken(req) {
  const header = String(req.headers?.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function nextStatus(current) {
  const index = STATUSES.indexOf(current);
  return index >= 0 && index < STATUSES.length - 1 ? STATUSES[index + 1] : null;
}

function transitionOrder(order, requestedStatus, note, now = new Date().toISOString(), options = {}) {
  const requested = String(requestedStatus || "").trim();
  const cleanNote = String(note || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 1200);
  const updated = { ...order, updatedAt: now };

  if (requested) {
    const expected = nextStatus(order.status);
    if (requested !== expected) throw new Error(expected ? `Next status must be ${expected}.` : "This order is already delivered.");
    if (requested === "DELIVERED" && !options.allowDelivery) throw new Error("Use the approved email delivery action to mark this order delivered.");
    if (requested === "REPORT_READY" && !order.report) throw new Error("Upload the final PDF before marking the report ready.");
    updated.status = requested;
    updated.timeline = [...(order.timeline || []), { status: requested, at: now, source: "operator" }];
  }

  if (note !== undefined) updated.operatorNote = cleanNote;
  return updated;
}

function safeOrder(order) {
  return {
    orderId: order.orderId,
    status: order.status,
    service: order.service,
    name: order.name,
    email: order.email,
    phone: order.phone,
    year: order.year,
    make: order.make,
    model: order.model,
    vin: order.vin,
    mileage: order.mileage,
    price: order.price,
    location: order.location,
    titleStatus: order.titleStatus,
    listing: order.listing,
    concerns: order.concerns,
    sellerClaims: order.sellerClaims,
    evidence: order.evidence,
    files: (order.files || []).map(({ pathname, ...file }) => ({ ...file, fileId: pathname })),
    report: order.report ? (({ pathname, ...report }) => ({ ...report, fileId: pathname }))(order.report) : null,
    delivery: order.delivery || null,
    operatorNote: order.operatorNote || "",
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    timeline: order.timeline || [],
  };
}

function trackerUrl(req, secret) {
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "www.vehiclereportdesk.com").split(",")[0].trim();
  const proto = String(req.headers?.["x-forwarded-proto"] || "https").split(",")[0].trim();
  return `${proto}://${host}/tracker.html#token=${encodeURIComponent(trackerToken(secret))}`;
}

module.exports = { STATUSES, STATUS_LABELS, trackerToken, verifyTrackerToken, bearerToken, nextStatus, transitionOrder, safeOrder, trackerUrl };
