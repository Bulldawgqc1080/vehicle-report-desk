const CONTACT_EMAIL = "justin@websitecheckpro.com";

const serviceSelect = document.querySelector("#service");
const intakeForm = document.querySelector("#intake-form");
const formNote = document.querySelector("#form-note");

document.querySelectorAll("[data-service]").forEach((link) => {
  link.addEventListener("click", () => {
    if (serviceSelect) serviceSelect.value = link.dataset.service;
  });
});

if (intakeForm) {
  intakeForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const values = {
      service: serviceSelect.value,
      name: document.querySelector("#name").value.trim(),
      email: document.querySelector("#email").value.trim(),
      listing: document.querySelector("#listing").value.trim() || "Not supplied",
      vin: document.querySelector("#vin").value.trim().toUpperCase() || "Not supplied",
      price: document.querySelector("#price").value.trim() || "Not supplied",
      notes: document.querySelector("#notes").value.trim() || "None supplied",
    };

    if (!intakeForm.reportValidity()) return;

    const subject = `${values.service} request — ${values.name}`;
    const body = [
      "Hi Justin,",
      "",
      `I'd like to request a ${values.service}.`,
      "",
      `Name: ${values.name}`,
      `Reply email: ${values.email}`,
      `Listing URL: ${values.listing}`,
      `VIN: ${values.vin}`,
      `Asking price: ${values.price}`,
      "",
      "Notes:",
      values.notes,
      "",
      "I understand this is research and decision support—not a mechanical inspection, title guarantee, warranty, or transaction-arranging service.",
    ].join("\n");

    formNote.textContent = "Opening your email app… If nothing happens, email justin@websitecheckpro.com.";
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
}

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();
