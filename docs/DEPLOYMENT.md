# Cloudflare deployment

## Current resources

| Resource                          | Name                    |
| --------------------------------- | ----------------------- |
| Public Worker                     | `loveletta`             |
| Editor Worker                     | `loveletta-studio`      |
| Private API Worker                | `loveletta-api`         |
| D1 database                       | `loveletta-content`     |
| R2 bucket                         | `loveletta-media`       |
| Service binding on both frontends | `API` → `loveletta-api` |
| D1 binding on API                 | `DB`                    |
| R2 binding on API                 | `MEDIA`                 |
| Public-site URL variable on API   | `PUBLIC_URL`            |

The checked-in Wrangler configuration contains resource identifiers and public URLs, which are not credentials. No API token, password, session token, or setup token is in this repository.

## Update this deployment

```bash
npm ci
npm run build
npm run check
npm test
npx wrangler login
npm run deploy:api
npm run deploy:public
npm run deploy:editor
```

Authenticate as the Cloudflare account that owns these resources. Deployment changes code; normal content edits should use the studio instead. The API must remain `workers_dev: false` and `preview_urls: false`. Both frontend configurations independently bind to it.

## Install in another Cloudflare account

1. Install dependencies and authenticate with Wrangler.
2. Create a D1 database named `loveletta-content` and an R2 bucket named `loveletta-media` using the Cloudflare dashboard or Wrangler.
3. Update the database ID in `backend/wrangler.jsonc`. Change Worker names and service targets if necessary. Update `PUBLIC_URL` to the new public site's exact origin.
4. Initialize the new database with `scripts/bootstrap.mjs`. Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `LOVELETTA_DATABASE_ID`, and `LOVELETTA_EDITOR_URL` in the process environment. Give the temporary bootstrap API token access only to the chosen account's D1 database. Never put it in a source file or commit it.
5. Run `node scripts/bootstrap.mjs`. It applies the SQL schema, seeds a sample garden, and returns one private setup link. It refuses to overwrite an initialized database.
6. Build, test, and deploy the API first, then the two frontends. Complete setup through the private link and choose the administrator password.

For additional schema changes, add a migration under `backend/migrations/` and apply it deliberately. The initial bootstrap already creates the first schema; do not reinitialize a live database.

## Recover an unused or lost setup invitation

If setup has not been completed and the invitation expires, generate a new cryptographically random token locally, store only its SHA-256 digest in `credentials.setup_hash`, and set `setup_expires` to 48 hours in the future. Perform this only through an authenticated Cloudflare D1 administration session. Supply the raw token in the private studio URL fragment as `/#setup=TOKEN`.

If an editor password has been lost after setup, an authorized account owner can revoke editor sessions, clear the existing password, and issue a new single-use invitation through D1 administration. There is deliberately no public password-reset endpoint.

## Security and operation

- Passwords use PBKDF2-SHA-256 with 100,000 iterations and a unique random salt.
- Administrator and visitor sessions are random bearer tokens whose SHA-256 digests are stored in D1.
- Authentication attempts are rate limited per hashed client IP in D1.
- Mutations require an exact same-origin Origin header and an application request header.
- Parameterized queries are used for input values. Publishing uses a D1 batch transaction and optimistic revisions.
- Uploaded images are checked by allowed MIME type and magic bytes. Active SVG and HTML uploads are rejected. All media responses set `nosniff`.
- Keep R2 public access disabled. Media authorization is performed before reads; private and published media are never served from an unprotected bucket URL.
- R2 uploads are capped at 20 MB. Media body handling is bounded; byte ranges support audio seeking.
- Public responses have a strict script policy; editor pages are excluded from search indexing.
- Errors log event names and error messages, without request bodies, cookies, or credentials.
- Cloudflare observability is sampled at 10%. Service use and R2 storage/operations are subject to the account's normal Cloudflare billing.

## Production verification

The production-check script accepts an authorized temporary session token through stdin. It verifies HTTP delivery, authorization, draft isolation, publishing, actual R2 writes/reads, ranges, rollback, and visitor gating. It restores original content in its cleanup block. The deployment operator must remove the temporary session, test publications, and test media afterward. Never use an end user's password for this check or commit session material.
