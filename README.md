# LoveLetta

An ivory-and-rose digital love letter, with a separate private studio and a shared Cloudflare backend.

- **Public website:** https://loveletta.digital-world-9896a4.workers.dev
- **Private studio:** https://loveletta-studio.digital-world-9896a4.workers.dev
- **Repository:** https://github.com/Lipticlemon/loveletta-

## What is included

The public experience opens with an illustrated floral garden, a wax-sealed envelope, and an animated letter reveal. It supports multiple formatted letters, a progressive typewriter effect, personalized signatures, photo lightboxes, polaroid and editorial galleries, a slideshow spotlight, relationship chapters, unfolding secret notes, and a music player with volume, looping, and an exact starting timestamp. Music starts through interaction or requests autoplay with a tap-to-play fallback.

The private studio has twelve organized sections, a live desktop/mobile preview, rich-text editing, six theme presets including dark and white variants, detailed typography and paper settings, floral tint/style/size/motion controls, media folders and replacement, photo and music collections, drag-and-drop chapter ordering with keyboard alternatives, section appearance controls, maintenance mode, visitor password protection, editor password rotation, configuration backups, publishing history, and rollback.

The initial content is a complete example love letter. Personalize the recipient, sender, words, photos, and soundtrack in the studio before sharing the link. No personal photographs or licensed songs are bundled.

A customizable full-screen flower-field video background is available under Theme & typography. Use transparent page backgrounds with adjustable paper opacity; upload MP4/WebM videos to R2 and configure overlays, blur, playback speed, start time, framing, autoplay, looping, and mobile behavior. A muted pink cosmos-field clip with a matching still image is included in the live configuration. See [asset credits](docs/ASSETS.md).

The floating music player supports a published playlist, previous/next controls, volume, and seeking within an independent start/end excerpt for every song. Upload multiple songs directly from Music in the studio, enter times like `0:45`–`1:30`, and choose whether to loop that excerpt, stop, or continue to the next song.

## Architecture

```text
apps/public/       Public entry point and independent Worker configuration
apps/editor/       Studio, authenticated preview, independent Worker configuration
backend/           Private API Worker, SQL schema and migrations
shared/            Renderer, defaults, validation, original botanical SVG, styles
scripts/           Deterministic build, validation, bootstrap and production checks
tests/             SQLite/R2 integration tests and DOM interaction tests
```

`loveletta` and `loveletta-studio` each call `loveletta-api` through a Cloudflare service binding. The API has no workers.dev or preview address. The public Worker explicitly rejects administrative API paths. The API independently enforces the calling surface, sessions, origin checks, request headers, and administrator authorization.

D1 (`loveletta-content`) stores drafts, publications, settings, media metadata, password hashes, sessions, and rate-limit counters. **R2 (`loveletta-media`) stores uploaded photographs, music, and other raster assets.** The bucket is not exposed publicly; media is served through the API after access checks. Public requests can access only media referenced by the currently published configuration. A visitor password also protects that media.

## Install and check

Use Node.js 22 or newer (Node.js 24 recommended).

```bash
npm ci
npm run build
npm run check
npm test
```

The runtime has no framework dependencies. The build embeds text assets into three independent Worker modules. LinkeDOM is used only for DOM tests; Wrangler is a development/deployment tool. Hosted fonts come from Google Fonts, with local serif/sans-serif fallbacks.

## Access the studio

For the first sign-in, use the **single-use setup URL supplied privately at delivery**. Its token is held in the URL fragment, removed from the address bar by the studio, and submitted only to the setup API. Choose a unique password of at least 14 characters. The link expires after 48 hours and cannot be reused. No default password exists, and no administrator credential or setup token is committed.

After setup, visit the normal studio URL and sign in with that password. Sessions last up to 12 hours and use Secure, HttpOnly, SameSite=Strict host-only cookies. Changing the editor password invalidates other editor sessions.

See [the editor guide](docs/EDITOR.md) and [deployment instructions](docs/DEPLOYMENT.md).

## Content workflow

1. Edit a chapter, theme, photograph, song, or setting. The embedded preview updates locally.
2. **Save draft** stores your work without changing the public site. `Ctrl/Cmd + S` also saves.
3. **Publish** saves and publishes the current configuration without redeploying code.
4. To return to an earlier design, open Publishing history, restore it as a draft, preview it, and publish it.

Visitor passwords and editor password changes are security operations and apply immediately. Maintenance mode and other content settings apply only after publishing. Unsaved changes trigger a browser warning before leaving the page. Concurrent draft changes are rejected instead of silently overwriting another editor.

## Media limits

R2 uploads are limited by this app to 20 MB per file, with images limited to 3 MB after optimization. Photos are resized locally to a maximum edge of 1800 pixels and encoded as WebP; animated GIFs are preserved. JPEG, PNG, WebP, GIF, MP3, M4A, OGG, WAV, MP4, and WebM are accepted. Use smaller compressed audio for faster playback. SVG uploads are intentionally excluded to prevent active content.

Replacing an upload changes its references in the current draft while retaining originals for published history. Unused files can be deleted. Files referenced by drafts, live content, or retained publications are protected from accidental deletion.

The API also includes a bounded D1 media fallback for installations without R2; **this deployment is configured to use R2**.

## Validation

`npm test` covers actual backend operations using SQLite and an R2 binding emulator, public DOM interactions, and all twelve editor sections. `scripts/live-test.mjs` exercises deployed HTTP endpoints and real R2 uploads using a temporary administrator session supplied through stdin. It does not consume the user's setup invitation.

See [the verification report](docs/VERIFICATION.md) for executed results and the browser-testing limitation.
