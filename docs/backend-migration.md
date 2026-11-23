# Formex commerce migration
## Compatibility audit before implementation
Formex f7b1d66 generates static pages through four Node generators. commerce/catalog.mjs combines Apple, Samsung and Pixel listings, merchant price amendments and local image mappings. Its 73 models contain 167 storage/colour variants. 28 variants lack a payable price and 10 models lack photos. The generated homepage catalogue has 71 entries including nine category navigation cards. The route manifest and embedded Product, FAQ and breadcrumb data serve existing product URLs. WhatsApp purchase, EasyBuy estimates and swap valuation have their own selectors and scripts. The original project has no order API or authentication. Vite and jsdom are development dependencies. Existing Vercel configuration sets image cache headers.

Mikee 1c297c8 uses fetch from Vercel Node handlers to PostgREST, Supabase Auth and Paystack. api/shop exposes catalog, deals, settings, create, verify and webhook. api/admin exposes login, manage, order, image, settings and deals. Its migrations cover catalogue editing, order lines, payment verification, reservations, transfer confirmation, admin roles, image staging, discounts and unrelated AI, merchant and financing functions. Its generators, product SQL, rollback scripts and owner provisioning are unsuitable imports. Its auth helper hardcodes an email and can provision a missing admin. Payment, transfer, pickup, shipping, contact, notification and financing configuration belong to Mikee. No remote Mikee data is needed.

## Implementation sequence
1. Create Formex-prefixed tables, explicit privileges and atomic order/payment functions in an independent project. Only server endpoints may access commerce records.
2. Import complete product metadata, every variant and ordered image from Formex using immutable slugs and conflict-safe inserts. Preserve null prices, existing discount calculations and confirmation-only availability.
3. Feed the existing generators a public catalogue snapshot for SEO and the same presentation. Use current database prices and availability for ordering. Keep swap, EasyBuy and WhatsApp flows available.
4. Add staff management, separately configured payment methods, pickup reservations and server-verified payment confirmation. Delivery requires a configured fee.
5. Test against fixtures and an isolated database where available. Review before connecting a dedicated project. No production promotion is part of this branch.

## Deployment and credentials
Use the new dedicated Formex project and the Formex Vercel project. The configured project reference determines the Supabase API host. The server rejects the two pre-existing project references discovered during audit. Vercel serves the dist directory and builds the API functions separately. The default build without a project produces the existing storefront. A configured build must successfully read the database. Catalogue and product responses use a 30-second CDN cache with a 30-second stale window. Account, order and payment endpoints use no-store.

| Environment variable | Purpose |
| --- | --- |
| FORMEX_PROJECT_REF | Independent Formex Supabase project reference, used to construct its HTTPS URL |
| FORMEX_SERVICE_ROLE_KEY | Server-only service-role credential from that project, also used by the build to read the public catalogue |
| FORMEX_PUBLISHABLE_KEY | Public Auth key for the same project, returned to the staff sign-in page |
| FORMEX_ORIGIN | Exact trusted Formex origin, including scheme and without a trailing slash |
| FORMEX_PAYSTACK_SECRET | Optional Formex Paystack test secret. Other key types disable Paystack. There is no live-mode switch. |
| FORMEX_BANK_NAME, FORMEX_ACCOUNT_NAME, FORMEX_ACCOUNT_NUMBER | Optional Formex-approved transfer instructions. All three are required, including a ten-digit account number. Use only sandbox instructions for staging. |
| VERCEL_ENV, VERCEL_URL, VERCEL_BRANCH_URL, VERCEL | Platform-provided preview origin and request handling. Vercel supplies these automatically. |

1. Create an independent Formex staging project. Confirm its name and project reference in the dashboard. Keep its credentials in Vercel Preview settings. Use a different project for eventual production.
2. Run the five SQL files in supabase/migrations in filename order in that project's SQL editor, once each. The catalogue seed can be replayed safely. It preserves operator edits. It creates zero customers, orders, payments and admin memberships. Review seed changes against Formex's original commerce/catalog.mjs. All initial checkout availability flags are false because source labels require confirmation.
3. Confirm the public schema is enabled in the Supabase Data API and Storage is enabled. The migrations create the formex-products public image bucket. Only the server uploads. Create and confirm an email/password staff user in Supabase Auth. Enrol the exact Auth user UUID from the dashboard with the following query in the new project.

```sql
insert into public.formex_admins(user_id) values ('<FORMEX_AUTH_USER_UUID>') on conflict do nothing;
```

4. Build a Formex Preview from this branch with the environment above. Sign in at /admin/. Confirm an actual variant and its current price, select the applicable condition and enable its checkout availability. Add the pickup instructions. Enter an approved flat delivery fee in naira to enable delivery. An empty fee disables it. Payment at pickup can be used immediately for confirmed variants. Review the customer, order, payment and fulfilment in admin.
5. Configure a Formex Paystack **test** webhook at the preview origin followed by /api/webhook. Paystack must be able to reach that URL. Test successful and abandoned transactions, signed webhook replay and a manual transfer in the dedicated staging project. Verify the transfer independently before using “Confirm money received”. Use the reference for reconciliation. For pickup, confirm cash or transfer at the counter before recording completion.
6. Check public product, category, search, deals, EasyBuy, swap and checkout views after an admin edit. Runtime catalogue and product routes reflect changes after cache expiry. Rebuild Preview to refresh its static snapshot, sitemap and pre-rendered homepage for crawlers. Existing product slugs are immutable. New models use the formex-device- prefix to avoid collisions. Archive to remove a product from purchase while retaining its records and order history.
7. A subsequent production release, production merchant configuration and live online payments require separate review and approval. To withdraw a preview, switch back to its previous deployment and retain the Formex database for review.

## Testing report
The local check covers site validation, the existing sales and catalogue suite, request authorization and payment verification. The database test boots an isolated PostgreSQL engine (PGlite), supplies minimal Supabase roles, Auth and bucket metadata, runs every migration and repeats the seed. It compares source prices including nulls, renders each database model with the existing page renderer, verifies RLS and access grants, and exercises order retries, fees, archive rules, staff fulfilment and Paystack amount checks. Run `npm ci && npm run check`, then `npm run build:vercel`. The test provider responses are fixtures.

Chromium checks at 390 and 1440 pixels loaded a real homepage image, selected iPhone 11 storage, followed the generated Formex WhatsApp destination, calculated a delivery total, submitted a pickup order and edited a staff variant with fixture API responses. The original homepage HTML and existing product pages remained byte-identical in the unconfigured build. Hosted Auth, Supabase Storage uploads, Data API configuration, provider redirects, webhook delivery, CDN behaviour and field performance still require a credentialled staging run.
