import { next } from "@vercel/functions";

const FALLBACK_HOST = "vehicle-report-desk.vercel.app";
const CANONICAL_HOST = "www.vehiclereportdesk.com";

export default function middleware(request) {
  const url = new URL(request.url);

  if (url.hostname !== FALLBACK_HOST) {
    return next();
  }

  url.protocol = "https:";
  url.hostname = CANONICAL_HOST;
  url.port = "";

  return new Response(null, {
    status: 308,
    headers: {
      location: url.toString()
    }
  });
}
