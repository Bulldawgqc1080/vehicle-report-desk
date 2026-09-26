const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const uploadHandler = require("./report-upload");
const deliverHandler = require("./deliver");
const { trackerToken, transitionOrder } = require("./tracker-lib");
const { decodeReport, emailContent, validateDelivery } = require("./delivery-lib");

function response() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function order(status = "RESEARCHING") {
  return {
    orderId: "VRD-20260926-DEL123", status, service: "Buyer Decision Report", name: "Test Buyer", email: "buyer@example.com",
    year: "2018", make: "Honda", model: "Accord", files: [], timeline: [], createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z",
  };
}

const pdfBuffer = Buffer.from("%PDF-1.7\nsynthetic test report\n%%EOF");
const pdfPayload = { name: "final-report.pdf", type: "application/pdf", data: pdfBuffer.toString("base64") };

test("validates PDF content and computes a delivery checksum", () => {
  const report = decodeReport(pdfPayload);
  assert.equal(report.buffer.equals(pdfBuffer), true);
  assert.equal(report.sha256, crypto.createHash("sha256").update(pdfBuffer).digest("hex"));
  assert.throws(() => decodeReport({ ...pdfPayload, data: Buffer.from("not a pdf").toString("base64") }), /not a valid PDF/);
});

test("builds escaped customer email content", () => {
  const content = emailContent({ ...order(), name: "<script>alert(1)</script>", orderId: "VRD-1" });
  assert.match(content.subject, /2018 Honda Accord/);
  assert.doesNotMatch(content.html, /<script>alert/);
  assert.match(content.text, /research and decision support/);
});

test("requires approval, a report, and exact recipient confirmation", () => {
  assert.throws(() => validateDelivery(order("REPORT_READY"), "buyer@example.com"), /Approve/);
  assert.throws(() => validateDelivery(order("APPROVED"), "buyer@example.com"), /Upload/);
  const ready = { ...order("APPROVED"), report: { pathname: "orders/x/report.pdf" } };
  assert.throws(() => validateDelivery(ready, "wrong@example.com"), /exactly/);
  assert.doesNotThrow(() => validateDelivery(ready, "BUYER@example.com"));
});

test("blocks a direct Delivered transition outside the delivery endpoint", () => {
  const approved = { ...order("APPROVED"), report: { pathname: "orders/x/report.pdf" } };
  assert.throws(() => transitionOrder(approved, "DELIVERED"), /approved email delivery/);
});

test("stores a private final PDF on an authorized order", async () => {
  const priorSecret = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "delivery-test-secret";
  let storedOrder = order();
  uploadHandler._test.setStore({
    async getOrder() { return storedOrder; },
    async saveReport(id, file) { return { pathname: `orders/${id}/report/final-report.pdf`, name: file.name, size: file.buffer.length, sha256: file.sha256, uploadedAt: "2026-09-26T01:00:00.000Z" }; },
    async saveOrder(value) { storedOrder = value; return value; },
  });
  const res = response();
  try {
    await uploadHandler({ method: "POST", headers: { authorization: `Bearer ${trackerToken("delivery-test-secret")}` }, body: { orderId: storedOrder.orderId, file: pdfPayload } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.order.report.name, "final-report.pdf");
    assert.equal(storedOrder.timeline.at(-1).status, "PDF_UPLOADED");
  } finally {
    uploadHandler._test.resetStore();
    if (priorSecret === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = priorSecret;
  }
});

test("marks Delivered only after the provider accepts the approved email", async () => {
  const priorSecret = process.env.TELEGRAM_BOT_TOKEN;
  const priorChat = process.env.TELEGRAM_CHAT_ID;
  process.env.TELEGRAM_BOT_TOKEN = "delivery-test-secret";
  delete process.env.TELEGRAM_CHAT_ID;
  const hash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  let storedOrder = { ...order("APPROVED"), report: { pathname: "orders/test/report/final-report.pdf", name: "final-report.pdf", sha256: hash } };
  deliverHandler._test.setStore({
    async getOrder() { return storedOrder; },
    async getPrivateBuffer() { return pdfBuffer; },
    async saveOrder(value) { storedOrder = value; return value; },
  });
  deliverHandler._test.setSendEmail(async () => ({ id: "email_test_123", from: "Vehicle Report Desk <reports@example.com>", replyTo: "support@example.com", subject: "Test report" }));
  const res = response();
  try {
    await deliverHandler({ method: "POST", headers: { authorization: `Bearer ${trackerToken("delivery-test-secret")}` }, body: { orderId: storedOrder.orderId, confirmEmail: storedOrder.email } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(storedOrder.status, "DELIVERED");
    assert.equal(storedOrder.delivery.emailId, "email_test_123");
    assert.equal(storedOrder.timeline.at(-1).status, "DELIVERED");
  } finally {
    deliverHandler._test.resetStore(); deliverHandler._test.resetSendEmail();
    if (priorSecret === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = priorSecret;
    if (priorChat === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = priorChat;
  }
});
