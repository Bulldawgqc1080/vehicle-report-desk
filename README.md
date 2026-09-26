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

The intake form posts vehicle details and up to three small supporting files to `/api/intake`. The Vercel function validates the request and forwards the order summary and attachments to a private Telegram chat. Payments remain on Stripe-hosted Payment Links and must be matched to the intake email before work begins.

Required Vercel Production environment variables:

- `TELEGRAM_BOT_TOKEN` — secret bot token
- `TELEGRAM_CHAT_ID` — private destination chat ID
- `TELEGRAM_TOPIC_ID` — optional forum-topic ID

Never commit those values. Without the first two variables, the endpoint returns a safe unavailable response and does not pretend the intake was received.

## Public sample policy

Only synthetic or clearly illustrative samples belong in this public repository. Never publish a real customer's VIN, title, seller identity, invoices, inspection documents, or proprietary history report without explicit authorization and appropriate redaction.
