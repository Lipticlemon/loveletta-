# Verification report

Verified on 19 October 2026 against the deployed Cloudflare account and the checked-in application source.

## Automated checks: 16 passed, 0 failed

Run with `npm test` on Node.js 24. The backend tests use real SQLite queries with a D1-compatible adapter and an R2 binding emulator. DOM tests run the actual renderer and editor code with LinkeDOM.

- Single-use setup, salted password hashing, and secure cookie settings.
- Rejection of anonymous administrator requests, forged surfaces, and cross-origin mutations.
- Draft isolation, publishing, optimistic revision checks, and rollback.
- R2 upload paths, unpublished media privacy, byte ranges, and media retention for history.
- Rejection of disguised images and deletion of unused uploads.
- Visitor password gating and invalidation of visitor sessions after rotation.
- Maintenance behavior and authentication rate limiting.
- Administrator password rotation, session invalidation, and logout.
- Rich-text sanitization including incomplete HTML tags and unsafe asset URLs.
- Separation of public and editor routes; authentication of full-page preview.
- Deletion of archived publications with protection for the current publication.
- All twelve editor sections load; music start-time edits are saved; publishing uses the saved revision.
- Envelope reveal, complete letter content, and unfolding/refolding secret messages.
- Layout ordering, hidden sections, typography, and floral-color configuration.
- Escaped headings/captions and removal of executable rich-text attributes.
- Progressive typewriter word generation while retaining complete readable text.

`npm run build` and `npm run check` also passed. The syntax check covers the source and generated Worker modules. The public deployment bundle does not contain the editor UI.

## Deployed HTTP and real R2 checks: 8 groups passed

Executed against the independent public and editor URLs using a temporary administrator session issued through authenticated D1 administration. The end user's setup link was not used.

1. Public HTML, editor HTML, stylesheets, scripts, favicon, and floral artwork returned HTTP 200.
2. Public content loaded; the deployed API reported `storage: R2`.
3. Anonymous administrative reads returned 401. Public administrative paths returned 404 even with forged surface headers. Anonymous full-page preview redirected to sign-in.
4. Saving a draft left the published content unchanged. A stale draft revision returned 409.
5. A real PNG was uploaded into R2. The metadata reported `storage: r2`; reading it through the authenticated editor returned the exact SHA-256 bytes. A public read before publication returned 404.
6. Publishing made that selected photograph available to the public. A byte-range request returned HTTP 206 and exactly the requested eight bytes.
7. Restoring an earlier publication loaded its content into a draft.
8. Visitor password protection returned 423 for locked content, accepted the correct password, issued a Secure/HttpOnly/SameSite=Strict cookie, and rejected a foreign Origin with 403. Public responses included CSP and `nosniff` headers.

The original public content was restored. The temporary test image was deleted from R2 through the authenticated API, temporary history was removed or relabeled as the verified launch publication, visitor protection was returned to its initial off state, and the temporary administrator session was revoked. Initial setup remains unused. No recipient-specific information was fabricated.

Final Cloudflare configuration confirms workers.dev enabled independently for `loveletta` and `loveletta-studio`, disabled for `loveletta-api`, and preview URLs disabled for all three.

## Browser verification limit

A supported browser-preview capability was unavailable in this environment. No screenshots, real-device visual review, measured Core Web Vitals, or browser-specific autoplay/accessibility audit were performed. Responsive CSS includes desktop/tablet/phone breakpoints, overflow safeguards, scalable typography, reduced-motion handling, and a mobile preview width. Those behaviors still merit a real-browser/device visual review. The DOM and HTTP checks above are actual executed checks; they are not a substitute for that visual review.

## Flower-field video update — 19 October 2026

The expanded automated suite passes 20 checks. Added coverage includes MP4 upload validation, publication-aware video access, streamed R2 byte ranges, legacy configuration defaults, safe video configuration, transparent page rendering, reduced-motion poster fallback, muted/inline playback, framing, speed, pause/play controls, direct editor video uploads, and overlay settings saved into drafts.

A 16-second 1280 × 720 pink cosmos clip and matching poster were uploaded to R2. Only background-video/transparency settings were applied to the current draft and publication; existing letter and gallery content were retained. The new publication is recorded in history. Real-browser visual/device verification remains unavailable, as documented above.
