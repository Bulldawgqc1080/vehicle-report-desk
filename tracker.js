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
  APPROVED: ["DELIVERED", "Mark delivered"],
};

const state = { token: "", orders: [], selected: null };
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
  const response = await fetch(`/api/tracker${path}`, {
    ...options,
    headers: { "content-type": "application/json", authorization: `Bearer ${state.token}`, ...(options.headers || {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Tracker request failed.");
  return result;
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
  const next = NEXT[order.status];
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
      ${next ? `<button id="advance-status" class="button button-primary" type="button" data-status="${next[0]}" data-confirm="${gate ? "true" : "false"}">${escapeHtml(next[1])}</button>` : '<p class="delivered-note">Order completed and delivered.</p>'}
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
    <section class="detail-card"><h3>Private attachments</h3><div class="attachment-list">${order.files?.length ? order.files.map((file, index) => `<button class="attachment-button" type="button" data-file-index="${index}">${escapeHtml(file.name)} <small>${Math.ceil(file.size / 1024)} KB</small></button>`).join("") : "<p>No attachments.</p>"}</div></section>
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
  } catch (error) {
    statusBox.textContent = error.message;
    statusBox.classList.add("error");
    if (advance) advance.disabled = false;
    if (saveNote) saveNote.disabled = false;
    if (attachment) attachment.disabled = false;
  }
});

search.addEventListener("input", renderList);
document.querySelector("#refresh-orders").addEventListener("click", () => loadOrders().catch(showFatal));
function showFatal(error) { statusBox.textContent = error.message; statusBox.classList.add("error"); app.hidden = true; }

state.token = readToken();
if (!state.token) showFatal(new Error("Open this page from the private tracker button in Telegram."));
else loadOrders().catch(showFatal);
