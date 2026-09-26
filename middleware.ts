import { next } from "@vercel/functions";
import { canonicalRedirectTarget } from "./canonical-redirect.mjs";

export default function middleware(request) {
  const destination = canonicalRedirectTarget(request.url);

  if (!destination) {
    return next();
  }

  return new Response(null, {
    status: 308,
    headers: {
      location: destination
    }
  });
}
