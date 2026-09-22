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

The intake form opens a prepared email to `justin@websitecheckpro.com`; it does not store submissions. Payments use Stripe-hosted Payment Links, while vehicle details and records remain separate from checkout.

## Public sample policy

Only synthetic or clearly illustrative samples belong in this public repository. Never publish a real customer's VIN, title, seller identity, invoices, inspection documents, or proprietary history report without explicit authorization and appropriate redaction.
