import { uploadPresigned } from "@vercel/blob/client";

const serviceSelect = document.querySelector("#service");
const intakeForm = document.querySelector("#intake-form");
const formNote = document.querySelector("#form-note");
const formStatus = document.querySelector("#form-status");
const submitButton = intakeForm?.querySelector("button[type='submit']");
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 25 * 1024 * 1024;

document.querySelectorAll("[data-service]").forEach((link) => {
  link.addEventListener("click", () => {
    if (serviceSelect) serviceSelect.value = link.dataset.service;
  });
});

function normalizeVin(value) {
  return value.replace(/\s+/g, "").toUpperCase();
}

function validateVin(value) {
  const vin = normalizeVin(value);
  if (!vin) return "";
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return "VIN must be 17 characters and cannot contain I, O, or Q.";
  const map = { A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9 };
  const weights = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
  const total = [...vin].reduce((sum, char, index) => sum + (/\d/.test(char) ? Number(char) : map[char]) * weights[index], 0);
  const remainder = total % 11;
  const expected = remainder === 10 ? "X" : String(remainder);
  return vin[8] === expected ? "" : `VIN check digit should be ${expected}. Please recheck it.`;
}

function safeFileName(name) {
  return name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100) || "attachment";
}

function trackEvent(event, path = window.location.pathname) {
  const body = JSON.stringify({ event, path });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
    return;
  }
  fetch("/api/analytics", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
}

trackEvent("page_view");
if (document.querySelector("[data-payment-success]")) trackEvent("payment_success_return");
document.querySelectorAll("[data-track]").forEach((link) => {
  link.addEventListener("click", () => trackEvent(link.dataset.track));
});

function showStatus(message, type = "working") {
  formStatus.textContent = message;
  formStatus.className = `form-status ${type}`;
}

if (intakeForm) {
  document.querySelector("#started-at").value = String(Date.now());
  const vinInput = document.querySelector("#vin");
  vinInput.addEventListener("input", () => {
    vinInput.value = normalizeVin(vinInput.value);
    vinInput.setCustomValidity("");
  });
  vinInput.addEventListener("blur", () => vinInput.setCustomValidity(validateVin(vinInput.value)));

  intakeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    trackEvent("intake_submit");
    vinInput.setCustomValidity(validateVin(vinInput.value));
    if (!intakeForm.reportValidity()) return;
    const selectedFiles = [...document.querySelector("#files").files];
    if (selectedFiles.length > MAX_FILES) {
      showStatus("Attach no more than 5 files.", "error");
      return;
    }
    if (selectedFiles.some((file) => file.size > MAX_FILE_BYTES)) {
      showStatus("Each attachment must be 10 MB or smaller.", "error");
      return;
    }
    if (selectedFiles.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_FILE_BYTES) {
      showStatus("Combined attachments must be 25 MB or smaller.", "error");
      return;
    }

    const sessionId = crypto.randomUUID();
    const startedAt = document.querySelector("#started-at").value;
    const uploads = [];
    submitButton.disabled = true;
    submitButton.textContent = "Sending securely…";
    showStatus(selectedFiles.length ? "Preparing secure private uploads…" : "Sending your vehicle details to the order desk…");
    try {
      const uploadPayload = JSON.stringify({ sessionId, startedAt });
      for (const [index, file] of selectedFiles.entries()) {
        showStatus(`Uploading ${index + 1} of ${selectedFiles.length}: ${file.name}`);
        const blob = await uploadPresigned(`pending-intake/${sessionId}/${safeFileName(file.name)}`, file, {
          access: "private",
          handleUploadUrl: "/api/upload",
          clientPayload: uploadPayload,
          multipart: file.size > 5 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => showStatus(`Uploading ${index + 1} of ${selectedFiles.length}: ${Math.round(percentage)}%`),
        });
        uploads.push({ pathname: blob.pathname, name: file.name, type: file.type, size: file.size });
      }
      if (selectedFiles.length) showStatus("Uploads complete. Creating your private order…");
      const payload = {
        service: serviceSelect.value, name: document.querySelector("#name").value.trim(), email: document.querySelector("#email").value.trim(),
        phone: document.querySelector("#phone").value.trim(), listing: document.querySelector("#listing").value.trim(), vin: vinInput.value,
        price: document.querySelector("#price").value.trim(), year: document.querySelector("#vehicle-year").value.trim(),
        make: document.querySelector("#make").value.trim(), model: document.querySelector("#model").value.trim(), mileage: document.querySelector("#mileage").value.trim(),
        location: document.querySelector("#location").value.trim(), titleStatus: document.querySelector("#title-status").value,
        concerns: document.querySelector("#concerns").value.trim(), sellerClaims: document.querySelector("#seller-claims").value.trim(),
        evidence: [...intakeForm.querySelectorAll("input[name='evidence']:checked")].map((input) => input.value),
        redactionAccepted: document.querySelector("#redaction-accepted").checked, termsAccepted: document.querySelector("#terms-accepted").checked,
        companyWebsite: document.querySelector("#company-website").value, startedAt: document.querySelector("#started-at").value,
        uploadSessionId: sessionId, uploads,
      };
      const response = await fetch("/api/intake", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Intake delivery failed.");
      intakeForm.reset();
      document.querySelector("#started-at").value = String(Date.now());
      showStatus(`Received. Your order reference is ${result.orderId}. Save this number.`, "success");
      trackEvent("intake_received");
      formNote.textContent = "We’ll verify the matching Stripe payment. Information already submitted will not be requested again unless something is contradictory or unreadable.";
    } catch (error) {
      if (uploads.length) {
        fetch("/api/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "cleanup-pending-uploads", payload: { sessionId, startedAt, pathnames: uploads.map((item) => item.pathname) } }),
        }).catch(() => {});
      }
      showStatus(error.message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit paid order details";
    }
  });
}

const contactForm = document.querySelector("#contact-form");
if (contactForm) {
  const contactStatus = document.querySelector("#contact-status");
  const contactButton = contactForm.querySelector("button[type='submit']");
  document.querySelector("#contact-started-at").value = String(Date.now());
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!contactForm.reportValidity()) return;
    contactButton.disabled = true;
    contactButton.textContent = "Sending…";
    contactStatus.textContent = "Sending your question securely…";
    contactStatus.className = "form-status working";
    try {
      const payload = {
        name: document.querySelector("#contact-name").value.trim(),
        email: document.querySelector("#contact-email").value.trim(),
        message: document.querySelector("#contact-message").value.trim(),
        companyWebsite: document.querySelector("#contact-company-website").value,
        startedAt: document.querySelector("#contact-started-at").value,
      };
      const response = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Your question could not be sent.");
      contactForm.reset();
      document.querySelector("#contact-started-at").value = String(Date.now());
      contactStatus.textContent = "Received. Justin will reply by email.";
      contactStatus.className = "form-status success";
      trackEvent("contact_received");
    } catch (error) {
      contactStatus.textContent = error.message;
      contactStatus.className = "form-status error";
    } finally {
      contactButton.disabled = false;
      contactButton.textContent = "Send my question";
    }
  });
}

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();
