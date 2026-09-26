const STATUS_LABELS = {
  INTAKE_RECEIVED: "Intake Received",
  PAYMENT_VERIFIED: "Payment Verified",
  RESEARCHING: "Researching",
  REPORT_READY: "Report Ready",
  APPROVED: "Approved for Delivery",
  DELIVERED: "Delivered",
};
const NEXT = {
  INTAKE_RECEIVED: ["PAYMENT_VERIFIED", "Verify Stripe payment"],
  PAYMENT_VERIFIED: ["RESEARCHING", "Start research"],
  RESEARCHING: ["REPORT_READY", "Mark report ready"],
  REPORT_READY: ["APPROVED", "Approve for delivery"],
};
const MAX_REPORT_BYTES = 3 * 1024 * 1024;

const state = { token: "", orders: [], selected: null, deliveryConfigured: false };
const statusBox = document.querySelector("#tracker-status");
const app = document.querySelector("#tracker-app");
const list = document.querySelector("#order-list");
const detail = document.querySelector("#order-detail");
const search = document.querySelector("#order-search");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function readToken() {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("token") || sessionStorage.getItem("vrdTrackerToken") || "";
  if (token) sessionStorage.setItem("vrdTrackerToken", token);
  history.replaceState(null, "", location.pathname);
  return token;
}

async function api(path = "", options = {}) {
  const response = await fetch(path ? `/api${path}` : "/api/tracker", {
    ...options,
    headers: { "content-type": "application/json", authorization: `Bearer ${state.token}`, ...(options.headers || {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Tracker request failed.");
  return result;
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve({ name: file.name, type: file.type, data: String(reader.result).split(",")[1] });
    reader.readAsDataURL(file);
  });
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function vehicle(order) {
  return [order.year, order.make, order.model].filter(Boolean).join(" ") || "Vehicle not specified";
}

function renderList() {
  const query = search.value.trim().toLowerCase();
  const filtered = state.orders.filter((order) => [order.orderId, order.name, order.email, order.vin, vehicle(order)].join(" ").toLowerCase().includes(query));
  list.innerHTML = filtered.length ? filtered.map((order) => `
    <button class="order-list-item ${state.selected?.orderId === order.orderId ? "active" : ""}" data-order="${escapeHtml(order.orderId)}" type="button">
      <span class="status-dot status-${escapeHtml(order.status.toLowerCase())}"></span>
      <span><strong>${escapeHtml(vehicle(order))}</strong><small>${escapeHtml(order.name)} · ${escapeHtml(order.orderId)}</small></span>
      <em>${escapeHtml(STATUS_LABELS[order.status])}</em>
    </button>`).join("") : '<p class="empty-state">No matching orders.</p>';
}

function field(label, value, link) {
  if (!value) return "";
  const rendered = link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a>` : escapeHtml(value);
  return `<div class="detail-field"><dt>${escapeHtml(label)}</dt><dd>${rendered}</dd></div>`;
}

function renderDetail() {
  const order = state.selected;
  if (!order) {
    detail.innerHTML = '<div class="empty-detail"><h2>Select an order</h2><p>Choose an intake to review its details and status.</p></div>';
    return;
  }
  let next = NEXT[order.status];
  if (next?.[0] === "REPORT_READY" && !order.report) next = null;
  const gate = next && ["PAYMENT_VERIFIED", "APPROVED"].includes(next[0]);
  detail.innerHTML = `
    <div class="detail-heading">
      <div><p class="eyebrow">${escapeHtml(order.orderId)}</p><h2>${escapeHtml(vehicle(order))}</h2><p>${escapeHtml(order.service)}</p></div>
      <span class="status-pill">${escapeHtml(STATUS_LABELS[order.status])}</span>
    </div>
    <section class="workflow-card">
      <h3>Workflow</h3>
      <ol class="status-timeline">${Object.entries(STATUS_LABELS).map(([key, label]) => {
        const event = order.timeline.find((item) => item.status === key);
        const current = order.status === key;
        return `<li class="${event ? "complete" : ""} ${current ? "current" : ""}"><span></span><div><strong>${escapeHtml(label)}</strong><small>${event ? formatDate(event.at) : "Pending"}</small></div></li>`;
      }).join("")}</ol>
      ${next ? `<button id="advance-status" class="button button-primary" type="button" data-status="${next[0]}" data-confirm="${gate ? "true" : "false"}">${escapeHtml(next[1])}</button>` : order.status === "DELIVERED" ? '<p class="delivered-note">Order completed and delivered.</p>' : order.status === "APPROVED" ? '<p class="gate-note">Approved. Use the delivery panel below to send the final PDF.</p>' : '<p class="gate-note">Upload the final PDF before marking the report ready.</p>'}
      ${gate ? '<p class="gate-note">Manual approval gate — confirm the evidence before advancing.</p>' : ""}
    </section>
    <section class="detail-card"><h3>Customer and vehicle</h3><dl class="detail-grid">
      ${field("Customer", order.name)}${field("Email", order.email, `mailto:${order.email}`)}${field("Phone", order.phone, `tel:${order.phone}`)}
      ${field("VIN", order.vin)}${field("Mileage", order.mileage)}${field("Asking price", order.price)}${field("Location", order.location)}${field("Title status", order.titleStatus)}
      ${field("Listing", order.listing, order.listing)}
    </dl></section>
    <section class="detail-card"><h3>Research brief</h3>
      <h4>Customer’s main concern</h4><p>${escapeHtml(order.concerns || "Not supplied")}</p>
      <h4>Seller claims / known issues</h4><p>${escapeHtml(order.sellerClaims || "Not supplied")}</p>
      <h4>Evidence available</h4><p>${escapeHtml((order.evidence || []).join(", ") || "None listed")}</p>
    </section>
    <section class="detail-card report-card"><h3>Final customer PDF</h3>
      ${order.report ? `<div class="report-file"><div><strong>${escapeHtml(order.report.name)}</strong><small>${Math.ceil(order.report.size / 1024)} KB · Uploaded ${formatDate(order.report.uploadedAt)}</small></div><button class="button button-secondary" id="preview-report" type="button">Preview PDF</button></div>` : "<p>No final report uploaded.</p>"}
      ${["PAYMENT_VERIFIED", "RESEARCHING", "REPORT_READY"].includes(order.status) ? `<div class="report-upload"><label for="report-file"><strong>${order.report ? "Replace final PDF" : "Upload final PDF"}</strong><span>PDF only, maximum 3 MB</span></label><input id="report-file" type="file" accept="application/pdf"><button id="upload-report" class="button button-secondary" type="button">${order.report ? "Replace PDF" : "Upload PDF"}</button></div>` : ""}
    </section>
    ${order.status === "APPROVED" ? `<section class="detail-card delivery-card"><h3>Approved customer delivery</h3>${state.deliveryConfigured ? `<p>The attached PDF will be emailed to <strong>${escapeHtml(order.email)}</strong>. This action cannot be undone.</p><label for="confirm-email">Type the customer email to confirm</label><input id="confirm-email" type="email" autocomplete="off" placeholder="${escapeHtml(order.email)}"><button id="send-report" class="button button-primary" type="button">Send report and mark delivered</button>` : '<p><strong>Email delivery setup is not finished.</strong> The approved report is safe; sending remains disabled until the provider and verified sender are connected.</p>'}</section>` : ""}
    ${order.delivery ? `<section class="detail-card delivery-receipt"><h3>Delivery receipt</h3><dl class="detail-grid">${field("Recipient", order.delivery.recipient)}${field("Sent", formatDate(order.delivery.sentAt))}${field("Email ID", order.delivery.emailId)}${field("Subject", order.delivery.subject)}</dl></section>` : ""}
    <section class="detail-card"><h3>Private intake attachments</h3><div class="attachment-list">${order.files?.length ? order.files.map((file, index) => `<button class="attachment-button" type="button" data-file-index="${index}">${escapeHtml(file.name)} <small>${Math.ceil(file.size / 1024)} KB</small></button>`).join("") : "<p>No attachments.</p>"}</div></section>
    <section class="detail-card"><label for="operator-note"><h3>Operator note</h3></label><textarea id="operator-note" rows="4" placeholder="Private notes, missing evidence, delivery details…">${escapeHtml(order.operatorNote || "")}</textarea><button id="save-note" class="button button-secondary" type="button">Save note</button></section>`;
}

function updateSelected(order) {
  state.selected = order;
  state.orders = state.orders.map((item) => item.orderId === order.orderId ? order : item);
  renderList();
  renderDetail();
}

async function loadOrders() {
  statusBox.textContent = "Loading private orders…";
  const result = await api();
  state.orders = result.orders;
  state.deliveryConfigured = Boolean(result.deliveryConfigured);
  state.selected = state.orders.find((order) => order.orderId === state.selected?.orderId) || state.orders[0] || null;
  statusBox.textContent = `${state.orders.length} order${state.orders.length === 1 ? "" : "s"} loaded.`;
  app.hidden = false;
  renderList();
  renderDetail();
}

list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-order]");
  if (!button) return;
  state.selected = state.orders.find((order) => order.orderId === button.dataset.order);
  renderList();
  renderDetail();
});

detail.addEventListener("click", async (event) => {
  const advance = event.target.closest("#advance-status");
  const saveNote = event.target.closest("#save-note");
  const attachment = event.target.closest("[data-file-index]");
  const uploadReport = event.target.closest("#upload-report");
  const previewReport = event.target.closest("#preview-report");
  const sendReport = event.target.closest("#send-report");
  try {
    if (advance) {
      if (advance.dataset.confirm === "true" && !confirm(`Confirm ${STATUS_LABELS[advance.dataset.status]} for ${state.selected.orderId}?`)) return;
      advance.disabled = true;
      const result = await api("", { method: "PATCH", body: JSON.stringify({ orderId: state.selected.orderId, status: advance.dataset.status }) });
      updateSelected(result.order);
      statusBox.textContent = `${result.order.orderId} moved to ${STATUS_LABELS[result.order.status]}.${result.notificationDelivered ? " Telegram updated." : " Status saved; Telegram update could not be sent."}`;
    }
    if (saveNote) {
      saveNote.disabled = true;
      const result = await api("", { method: "PATCH", body: JSON.stringify({ orderId: state.selected.orderId, note: document.querySelector("#operator-note").value }) });
      updateSelected(result.order);
      statusBox.textContent = `Private note saved for ${result.order.orderId}.`;
    }
    if (attachment) {
      const file = state.selected.files[Number(attachment.dataset.fileIndex)];
      attachment.disabled = true;
      const response = await fetch(`/api/tracker-file?order=${encodeURIComponent(state.selected.orderId)}&file=${encodeURIComponent(file.fileId)}`, { headers: { authorization: `Bearer ${state.token}` } });
      if (!response.ok) throw new Error("Attachment download failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = file.name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      attachment.disabled = false;
    }
    if (uploadReport) {
      const file = document.querySelector("#report-file").files[0];
      if (!file) throw new Error("Select the final PDF first.");
      if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf") || file.size > MAX_REPORT_BYTES) throw new Error("Select a PDF no larger than 3 MB.");
      uploadReport.disabled = true;
      statusBox.textContent = "Uploading the final PDF to private storage…";
      const result = await api("/report-upload", { method: "POST", body: JSON.stringify({ orderId: state.selected.orderId, file: await fileToPayload(file) }) });
      updateSelected(result.order);
      statusBox.textContent = `Final PDF stored for ${result.order.orderId}. Preview it before approval.`;
    }
    if (previewReport) {
      previewReport.disabled = true;
      const previewWindow = window.open("", "_blank");
      const response = await fetch(`/api/tracker-file?order=${encodeURIComponent(state.selected.orderId)}&file=${encodeURIComponent(state.selected.report.fileId)}`, { headers: { authorization: `Bearer ${state.token}` } });
      if (!response.ok) throw new Error("Report preview failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (previewWindow) previewWindow.location.href = url;
      else { const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener"; link.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      previewReport.disabled = false;
    }
    if (sendReport) {
      const confirmEmail = document.querySelector("#confirm-email").value.trim();
      if (confirmEmail.toLowerCase() !== state.selected.email.toLowerCase()) throw new Error("Type the customer email exactly to confirm delivery.");
      if (!confirm(`Send the approved PDF to ${state.selected.email}? This cannot be undone.`)) return;
      sendReport.disabled = true;
      statusBox.textContent = `Sending the approved report to ${state.selected.email}…`;
      const result = await api("/deliver", { method: "POST", body: JSON.stringify({ orderId: state.selected.orderId, confirmEmail }) });
      updateSelected(result.order);
      statusBox.textContent = `${result.order.orderId} delivered to ${result.order.delivery.recipient}.${result.telegramDelivered ? " Telegram receipt sent." : " Delivery succeeded; Telegram receipt was unavailable."}`;
    }
  } catch (error) {
    statusBox.textContent = error.message;
    statusBox.classList.add("error");
    if (advance) advance.disabled = false;
    if (saveNote) saveNote.disabled = false;
    if (attachment) attachment.disabled = false;
    if (uploadReport) uploadReport.disabled = false;
    if (previewReport) previewReport.disabled = false;
    if (sendReport) sendReport.disabled = false;
  }
});

search.addEventListener("input", renderList);
document.querySelector("#refresh-orders").addEventListener("click", () => loadOrders().catch(showFatal));
function showFatal(error) { statusBox.textContent = error.message; statusBox.classList.add("error"); app.hidden = true; }

state.token = readToken();
if (!state.token) showFatal(new Error("Open this page from the private tracker button in Telegram."));
else loadOrders().catch(showFatal);
