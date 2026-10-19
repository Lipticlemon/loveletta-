import { test } from "node:test";
import assert from "node:assert/strict";
import { versionClientAssets } from "../scripts/client-assets.mjs";
import { createFrontend } from "../shared/frontend.js";
const assets = {
  "/app.js": {
    type: "application/javascript",
    content: 'import { render } from "/render.js";',
  },
  "/render.js": {
    type: "application/javascript",
    content: 'import { mailMarkup } from "./mail.js";',
  },
  "/mail.js": {
    type: "application/javascript",
    content: 'export const mailMarkup = "My letters & replies";',
  },
  "/style.css": { type: "text/css", content: "body {color:pink}" },
};
const html =
  '<link rel="stylesheet" href="/style.css"><script type="module" src="/app.js"></script>';
test("a changed nested module gives desktop, mobile and preview a new complete module graph", () => {
  const before = versionClientAssets(assets, html, html);
  const updated = structuredClone(assets);
  updated["/mail.js"].content =
    'export const mailMarkup = "My letters | Replies";';
  const after = versionClientAssets(updated, html, html);
  assert.notEqual(before.revision, after.revision);
  assert.equal(
    after.revision,
    versionClientAssets(updated, html, html).revision,
  );
  for (const page of [after.html, after.previewHtml]) {
    assert.ok(page.includes("/app.js?v=" + after.revision));
    assert.ok(page.includes("/style.css?v=" + after.revision));
  }
  assert.ok(
    after.assets["/app.js"].content.includes("/render.js?v=" + after.revision),
  );
  assert.ok(
    after.assets["/render.js"].content.includes(
      "./mail.js?v=" + after.revision,
    ),
  );
  assert.equal(
    assets["/render.js"].content,
    'import { mailMarkup } from "./mail.js";',
  );
});
test("scripts and styles revalidate on both frontends regardless of browser user agent or old query", async () => {
  const client = versionClientAssets(assets, html);
  for (const surface of ["public", "editor"]) {
    const frontend = createFrontend(
      surface,
      client.assets,
      client.html,
      "",
      client.revision,
    );
    for (const agent of [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    ]) {
      for (const path of [
        "/mail.js",
        "/mail.js?v=old-desktop-release",
        "/style.css?v=" + client.revision,
      ]) {
        const response = await frontend.fetch(
          new Request("https://love.test" + path, {
            headers: { "user-agent": agent },
          }),
          {},
        );
        assert.equal(response.status, 200);
        assert.match(response.headers.get("Cache-Control"), /no-cache/);
        assert.match(response.headers.get("Cache-Control"), /must-revalidate/);
        assert.equal(
          response.headers.get("X-Loveletta-Release"),
          client.revision,
        );
      }
    }
  }
});
