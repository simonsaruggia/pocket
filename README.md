# Pocket on Railway

Standalone copy of Pocket, migrated from ChatGPT Sites. Node 24 serves the original Worker through a production adapter and stores SQLite on the Railway persistent volume at `/data/pocket.sqlite`.

## Deployment

Project: `593a3524-9acb-450e-9904-2f6704b661c3`
Environment: `5e9adda7-ce53-407b-ba32-2ba535ee69b7`
Service: `d67cba8a-6c6f-455e-b838-9efb33aa5407`
Domain: https://pocket-production-e3d7.up.railway.app

Dockerfile builds the existing Worker and starts `scripts/railway-server.mjs`. Set PORT=3000 to match the domain target. Keep the `/data` volume attached across deployments. Schema migrations run transactionally once per filename.

## Access and secrets

The private entry link uses `/#key=...`. The fragment stays out of HTTP request logs and is cleared immediately, then exchanged for a Secure, HttpOnly, SameSite cookie. No ChatGPT sign-in is required. Anyone with that access link can access and edit this personal Pocket. Rotating POCKET_ACCESS_KEY invalidates all device sessions. Never commit keys, exports, or databases.

Required server variables: OPENAI_API_KEY, POCKET_ACCESS_KEY (at least 40 characters), POCKET_OWNER_ID. Incoming user identity headers are stripped; the adapter supplies the configured owner's ID only after verifying the session. The old ChatGPT connector is not connected to this Railway copy.

AI drafts still require confirmation to save. Existing rolling rate limits apply, with an additional ceiling of 300 AI requests per UTC calendar month. This is a request cap, not a guaranteed dollar cap.

## Migration and verification

`private/export.json` is an ignored full snapshot of the five source data tables. `scripts/verify-migration.py` imports into an empty database only using temporary POCKET_IMPORT_KEY, then compares every expense field, tags, and budgets. Disable POCKET_IMPORT_KEY after import. Import uses one transaction and refuses a second nonempty import.

The original Sites app remains independent. Writes made there after the snapshot do NOT synchronise to Railway. Use Railway for new entries after switching; retain Sites as the fallback copy until explicitly retired.

The web app manifest and PNG icons support Add to Home Screen. It requires connectivity to load data and call GPT; offline editing is not implemented.

## Bank connection and currency

This is Simon's EUR Pocket, including Revolut Italy through Enable Banking, six-hour background sync, and user-requested **Refresh now**. Only settled purchases are imported. Incoming transfers/refunds are not saved as spending. Review, duplicate checks, optional GPT category suggestions, and optional automatic saving are included. EUR is the base currency; USD and ARS input use official exchange-rate conversion.

Banking requires `ENABLE_BANKING_APP_ID` and `ENABLE_BANKING_PRIVATE_KEY` in Railway's service variables. OpenAI uses `OPENAI_API_KEY`. No secret values belong in this repository. Keep the existing Railway volume and variables: cloning the source does not copy expenses, bank sessions, or credentials. Manual refresh relies on Railway's client-IP header.

## Development

Use Node.js 24. No third-party npm dependencies are required.

```sh
npm run build
npm test
```

The 49 tests cover expenses, currencies, trip rules, GPT drafts, bank authorization, duplicate detection, and background/manual refresh behavior. `npm start` starts the Railway adapter using the configured environment and persistent data directory.

This repository contains only this instance's application code. The separate girlfriend Pocket instance is not included.
