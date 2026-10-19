import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const line = await new Promise((resolve) => {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (s) => {
    input += s;
    if (input.includes("\n")) resolve(input.split("\n")[0]);
  });
});
const { token } = JSON.parse(line),
  publicUrl = "https://loveletta.digital-world-9896a4.workers.dev",
  editorUrl = "https://loveletta-studio.digital-world-9896a4.workers.dev";
const cookie = "__Host-loveletta=" + token;
let failed = false,
  passed = 0,
  original,
  uploaded,
  publishedIds = [];
async function request(
  path,
  {
    surface = "editor",
    method = "GET",
    body,
    raw,
    headers = {},
    auth = true,
  } = {},
) {
  const base = surface === "public" ? publicUrl : editorUrl;
  const res = await fetch(base + path, {
    method,
    headers: {
      Origin: base,
      "X-Loveletta-Request": "1",
      ...(auth ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  return res;
}
async function check(label, fn) {
  await fn();
  console.log("PASS " + label);
  passed++;
}
async function state() {
  const r = await request("/api/admin/state");
  assert.equal(r.status, 200);
  return r.json();
}
async function save(c) {
  const s = await state();
  const r = await request("/api/admin/draft", {
    method: "PUT",
    body: { config: c, revision: s.revision },
  });
  assert.equal(r.status, 200, await r.text());
}
async function publish() {
  const s = await state();
  const r = await request("/api/admin/publish", {
    method: "POST",
    body: {
      revision: s.revision,
      label: "Production verification (temporary)",
    },
  });
  assert.equal(r.status, 200);
  publishedIds.push((await r.json()).id);
}
try {
  await check(
    "public HTML, separate editor HTML, and all static modules respond",
    async () => {
      for (const [base, paths] of [
        [
          publicUrl,
          [
            "/",
            "/app.js",
            "/render.js",
            "/validation.js",
            "/style.css",
            "/floral.svg",
            "/favicon.svg",
          ],
        ],
        [
          editorUrl,
          ["/", "/editor.js", "/editor.css", "/defaults.js", "/preview.js"],
        ],
      ])
        for (const path of paths) {
          const r = await fetch(base + path);
          assert.equal(r.status, 200, base + path);
          assert.ok((await r.text()).length > 20);
        }
    },
  );
  await check(
    "public content loads and both Workers use R2 through the shared API",
    async () => {
      const r = await request("/api/content", { surface: "public" });
      assert.equal(r.status, 200);
      const c = await r.json();
      assert.ok(c.config.letters.length);
      const h = await (await request("/api/health")).json();
      assert.equal(h.storage, "R2");
    },
  );
  await check(
    "editor rejects anonymous access; public rejects admin paths and forged headers",
    async () => {
      assert.equal(
        (await request("/api/admin/state", { auth: false })).status,
        401,
      );
      assert.equal(
        (
          await request("/api/admin/state", {
            surface: "public",
            headers: { "x-loveletta-surface": "editor" },
          })
        ).status,
        404,
      );
      const preview = await fetch(editorUrl + "/preview", {
        redirect: "manual",
      });
      assert.equal(preview.status, 302);
    },
  );
  original = (await state()).config;
  await check(
    "draft changes remain private; stale saves are rejected",
    async () => {
      const c = structuredClone(original),
        s = await state();
      c.welcome.note = "Temporary verification draft";
      await save(c);
      const publicContent = await (
        await request("/api/content", { surface: "public" })
      ).json();
      assert.equal(publicContent.config.welcome.note, original.welcome.note);
      assert.equal(
        (
          await request("/api/admin/draft", {
            method: "PUT",
            body: { config: c, revision: s.revision },
          })
        ).status,
        409,
      );
    },
  );
  await check(
    "real image upload writes to R2 and remains private before publication",
    async () => {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6x5sAAAAASUVORK5CYII=",
        "base64",
      );
      const res = await request("/api/admin/media", {
        method: "POST",
        raw: png,
        headers: {
          "Content-Type": "image/png",
          "X-File-Name": "production-verification.png",
          "X-Folder": "Verification",
        },
      });
      assert.equal(res.status, 201);
      uploaded = await res.json();
      const list = await (await request("/api/admin/media")).json();
      assert.equal(list.find((m) => m.id === uploaded.id).storage, "r2");
      const saved = await request(uploaded.src);
      assert.equal(
        createHash("sha256")
          .update(Buffer.from(await saved.arrayBuffer()))
          .digest("hex"),
        createHash("sha256").update(png).digest("hex"),
      );
      assert.equal(
        (await request(uploaded.src, { surface: "public", auth: false }))
          .status,
        404,
      );
    },
  );
  await check(
    "publishing makes media available and HTTP ranges return the exact bytes",
    async () => {
      const c = structuredClone(original);
      c.gallery.items.push({
        id: "verification-memory",
        src: uploaded.src,
        caption: "Verification",
        date: "",
      });
      await save(c);
      await publish();
      const r = await request(uploaded.src, {
        surface: "public",
        auth: false,
        headers: { Range: "bytes=0-7" },
      });
      assert.equal(r.status, 206);
      assert.equal((await r.arrayBuffer()).byteLength, 8);
      assert.match(r.headers.get("content-range"), /^bytes 0-7\//);
    },
  );
  await check("rollback loads a prior publication into a draft", async () => {
    const s = await state();
    const r = await request("/api/admin/revert", {
      method: "POST",
      body: { id: "initial-garden", revision: s.revision },
    });
    assert.equal(r.status, 200);
    const c = await r.json();
    assert.equal(c.config.gallery.items.length, 0);
  });
  await check(
    "visitor password, cross-origin rejection, and secure response headers",
    async () => {
      const gated = await request("/api/admin/security", {
        method: "PUT",
        body: { gatePassword: "temporary production check" },
      });
      assert.equal(gated.status, 200);
      assert.equal(
        (await request("/api/content", { surface: "public", auth: false }))
          .status,
        423,
      );
      const unlocked = await request("/api/unlock", {
        surface: "public",
        method: "POST",
        auth: false,
        body: { password: "temporary production check" },
      });
      assert.equal(unlocked.status, 200);
      assert.match(
        unlocked.headers.get("set-cookie"),
        /HttpOnly; Secure; SameSite=Strict/,
      );
      assert.equal(
        (
          await request("/api/admin/security", {
            method: "PUT",
            body: { gatePassword: "" },
            headers: { Origin: "https://evil.example" },
          })
        ).status,
        403,
      );
      const r = await fetch(publicUrl);
      assert.ok(
        r.headers.get("content-security-policy").includes("script-src 'self'"),
      );
      assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    },
  );
} catch (e) {
  failed = true;
  console.error("FAIL " + e.message);
  process.exitCode = 1;
} finally {
  if (original) {
    await request("/api/admin/security", {
      method: "PUT",
      body: { gatePassword: "" },
    });
    await save(original);
    await publish();
  }
  console.log(
    JSON.stringify({
      passed,
      cleanup: { mediaId: uploaded?.id, publishedIds },
    }),
  );
  process.exit(failed ? 1 : 0);
}
