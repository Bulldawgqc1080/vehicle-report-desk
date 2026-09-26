# Vehicle Report Desk

Static MVP landing page for two evidence-labeled used-vehicle research services:

- Buyer Decision Report
- Seller Transparency Packet

## Local preview

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Deployment

The source belongs in GitHub, but the commercial website should be deployed through Vercel rather than GitHub Pages. Import the repository into Vercel; no build command or output-directory override is required.

## Intake

The intake form posts vehicle details and up to three small supporting files to `/api/intake`. The Vercel function validates the request, persists the order and attachments in a private Vercel Blob store, and forwards the order summary and a signed tracker link to a private Telegram chat. Payments remain on Stripe-hosted Payment Links and must be matched to the intake email before work begins.

Required Vercel Production environment variables:

- `TELEGRAM_BOT_TOKEN` — secret bot token
- `TELEGRAM_CHAT_ID` — private destination chat ID
- `TELEGRAM_TOPIC_ID` — optional forum-topic ID
- Vercel Blob connection — private store using OIDC (`BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY` are added by Vercel)
- `RESEND_API_KEY` — transactional-email credential, preferably provisioned through the Vercel Marketplace
- `REPORT_FROM_EMAIL` — verified sender, including friendly name (for example `Vehicle Report Desk <reports@example.com>`)
- `REPORT_REPLY_TO` — reply address; defaults to `justin@websitecheckpro.com`
- `REPORT_BCC_EMAIL` — optional private delivery copy

Never commit those values. Without the first two variables, the endpoint returns a safe unavailable response and does not pretend the intake was received.

## Private order tracker

`tracker.html` is an operator-only control panel opened from the signed Telegram button. Its token stays in the URL fragment, is moved to session storage, and is sent to `/api/tracker` only as a Bearer token. The tracker enforces this one-way workflow:

`Intake Received → Payment Verified → Researching → Report Ready → Approved for Delivery → Delivered`

Payment verification and delivery approval are explicit manual gates. Private order JSON and attachments never receive public Blob URLs. Rotating the Telegram bot token invalidates existing tracker links.

The operator may upload or replace one final PDF (maximum 3 MB) before approval. The tracker requires a previewable PDF before `Report Ready`, blocks replacement after approval, and requires the exact customer email plus a second confirmation before sending. A successful Resend API response—not a button click—moves the order to `Delivered`. Each send uses a report-specific idempotency key and the stored delivery receipt prevents repeat sends.

## Public sample policy

Only synthetic or clearly illustrative samples belong in this public repository. Never publish a real customer's VIN, title, seller identity, invoices, inspection documents, or proprietary history report without explicit authorization and appropriate redaction.
