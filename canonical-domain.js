(() => {
  const fallbackHost = "vehicle-report-desk.vercel.app";

  if (window.location.hostname !== fallbackHost) {
    return;
  }

  const destination = new URL(window.location.href);
  destination.protocol = "https:";
  destination.hostname = "www.vehiclereportdesk.com";
  destination.port = "";
  window.location.replace(destination.href);
})();
