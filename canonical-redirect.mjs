const FALLBACK_HOST = "vehicle-report-desk.vercel.app";
const CANONICAL_HOST = "www.vehiclereportdesk.com";

export function canonicalRedirectTarget(requestUrl) {
  const url = new URL(requestUrl);

  if (url.hostname !== FALLBACK_HOST) {
    return null;
  }

  url.protocol = "https:";
  url.hostname = CANONICAL_HOST;
  url.port = "";

  return url.toString();
}
