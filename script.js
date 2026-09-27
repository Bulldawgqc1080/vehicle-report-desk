const serviceSelect = document.querySelector("#service");
const intakeForm = document.querySelector("#intake-form");
const formNote = document.querySelector("#form-note");
const formStatus = document.querySelector("#form-status");
const submitButton = intakeForm?.querySelector("button[type='submit']");
const MAX_FILES = 5;
const MAX_FILE_BYTES = 900 * 1024;
const MAX_TOTAL_FILE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2200;

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

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function prepareFile(file) {
  if (file.type === "application/pdf") {
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than 900 KB. Please submit without it and reply to the confirmation email for help.`);
    return file;
  }
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not a supported PDF or image.`);
  if (file.size <= MAX_FILE_BYTES) return file;

  const sourceUrl = await readAsDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error(`Could not compress ${file.name}. Save it as JPG, PNG, or WebP and try again.`));
    element.src = sourceUrl;
  });
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  let blob = null;
  for (const quality of [.82, .72, .62, .52]) {
    blob = await canvasToBlob(canvas, quality);
    if (blob && blob.size <= MAX_FILE_BYTES) break;
  }
  if (!blob || blob.size > MAX_FILE_BYTES) throw new Error(`${file.name} could not be reduced below 900 KB.`);
  const safeName = file.name.replace(/\.[^.]+$/, "") + "-compressed.jpg";
  return new File([blob], safeName, { type: "image/jpeg" });
}

async function fileToPayload(file) {
  const dataUrl = await readAsDataUrl(file);
  return { name: file.name, type: file.type, data: dataUrl.split(",")[1] };
}

document.querySelectorAll("[data-track]").forEach((link) => {
  link.addEventListener("click", () => window.va?.("event", { name: link.dataset.track }));
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
    vinInput.setCustomValidity(validateVin(vinInput.value));
    if (!intakeForm.reportValidity()) return;
    const selectedFiles = [...document.querySelector("#files").files];
    if (selectedFiles.length > MAX_FILES) {
      showStatus("Attach no more than 5 files.", "error");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Sending securely…";
    showStatus("Sending your vehicle details to the order desk…");
    try {
      const preparedFiles = [];
      for (const file of selectedFiles) preparedFiles.push(await prepareFile(file));
      const totalBytes = preparedFiles.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > MAX_TOTAL_FILE_BYTES) throw new Error("Combined attachments are still larger than 3 MB. Submit the most important files first and reply to the confirmation email for help.");
      const files = await Promise.all(preparedFiles.map(fileToPayload));
      const payload = {
        service: serviceSelect.value, name: document.querySelector("#name").value.trim(), email: document.querySelector("#email").value.trim(),
        phone: document.querySelector("#phone").value.trim(), listing: document.querySelector("#listing").value.trim(), vin: vinInput.value,
        price: document.querySelector("#price").value.trim(), year: document.querySelector("#vehicle-year").value.trim(),
        make: document.querySelector("#make").value.trim(), model: document.querySelector("#model").value.trim(), mileage: document.querySelector("#mileage").value.trim(),
        location: document.querySelector("#location").value.trim(), titleStatus: document.querySelector("#title-status").value,
        concerns: document.querySelector("#concerns").value.trim(), sellerClaims: document.querySelector("#seller-claims").value.trim(),
        evidence: [...intakeForm.querySelectorAll("input[name='evidence']:checked")].map((input) => input.value),
        redactionAccepted: document.querySelector("#redaction-accepted").checked, termsAccepted: document.querySelector("#terms-accepted").checked,
        companyWebsite: document.querySelector("#company-website").value, startedAt: document.querySelector("#started-at").value, files,
      };
      const response = await fetch("/api/intake", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Intake delivery failed.");
      intakeForm.reset();
      document.querySelector("#started-at").value = String(Date.now());
      showStatus(`Received. Your order reference is ${result.orderId}. Save this number.`, "success");
      formNote.textContent = "We’ll verify the matching Stripe payment. Information already submitted will not be requested again unless something is contradictory or unreadable.";
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit paid order details";
    }
  });
}

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();
