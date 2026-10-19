import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import api, { hash, passwordHash } from "../backend/worker.js";
import { cloneDefaults } from "../shared/defaults.js";
import { validateConfig, sanitizeRichText } from "../shared/validation.js";
import { createFrontend } from "../shared/frontend.js";
crypto.subtle.timingSafeEqual = (a, b) => timingSafeEqual(a, b);
const schema = await readFile(
  new URL("../backend/schema.sql", import.meta.url),
  "utf8",
);
class D1 {
  constructor() {
    this.sql = new DatabaseSync(":memory:");
    this.sql.exec(schema);
  }
  prepare(sql) {
    const db = this;
    let values = [];
    return {
      bind(...v) {
        values = v;
        return this;
      },
      async first() {
        return db.sql.prepare(sql).get(...values) || null;
      },
      async all() {
        return { results: db.sql.prepare(sql).all(...values) };
      },
      async run() {
        const r = db.sql.prepare(sql).run(...values);
        return { meta: { changes: Number(r.changes) }, success: true };
      },
    };
  }
  async batch(statements) {
    this.sql.exec("BEGIN");
    try {
      const out = [];
      for (const s of statements) out.push(await s.run());
      this.sql.exec("COMMIT");
      return out;
    } catch (e) {
      this.sql.exec("ROLLBACK");
      throw e;
    }
  }
}
class R2 {
  objects = new Map();
  async put(k, b, opts) {
    this.objects.set(k, { bytes: new Uint8Array(b), opts });
    return { key: k };
  }
  async get(k, options) {
    const v = this.objects.get(k);
    if (!v) return null;
    const offset = options?.range?.offset || 0,
      length = options?.range?.length || v.bytes.length;
    const bytes = v.bytes.slice(offset, offset + length);
    return { body: bytes, arrayBuffer: async () => bytes.buffer };
  }
  async delete(k) {
    this.objects.delete(k);
  }
}
let env, token, adminCookie;
async function req(
  path,
  {
    method = "GET",
    body,
    cookie = adminCookie,
    surface = "editor",
    origin = "https://studio.test",
    headers = {},
    raw,
  } = {},
) {
  const r = new Request("https://studio.test" + path, {
    method,
    headers: {
      "x-loveletta-surface": surface,
      "x-client-ip": "127.0.0.1",
      "x-loveletta-request": "1",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body:
      raw ||
      (!["GET", "HEAD"].includes(method) && body !== undefined
        ? JSON.stringify(body)
        : undefined),
  });
  return api.fetch(r, env);
}
beforeEach(async () => {
  env = { DB: new D1(), MEDIA: new R2(), PUBLIC_URL: "https://public.test" };
  token = crypto.randomUUID();
  const c = JSON.stringify(cloneDefaults());
  await env.DB.prepare("INSERT INTO state VALUES(1,?,?,1,?)")
    .bind(c, c, new Date().toISOString())
    .run();
  await env.DB.prepare(
    "INSERT INTO credentials(id,setup_hash,setup_expires) VALUES(1,?,?)",
  )
    .bind(await hash(token), Date.now() + 60000)
    .run();
  adminCookie = undefined;
  const response = await req("/api/auth/setup", {
    method: "POST",
    cookie: "",
    body: { token, password: "correct horse battery staple" },
  });
  assert.equal(response.status, 200);
  adminCookie = response.headers.get("set-cookie").split(";")[0];
});
test("setup token is single-use; passwords are hashed; secure sessions", async () => {
  const c = await env.DB.prepare("SELECT * FROM credentials").first();
  assert.match(c.password, /^[a-f\d-]{36}:[a-f\d]{64}$/);
  assert.equal(c.setup_hash, null);
  const again = await req("/api/auth/setup", {
    method: "POST",
    body: { token, password: "another long password" },
  });
  assert.equal(again.status, 403);
  const login = await req("/api/auth/login", {
    method: "POST",
    cookie: "",
    body: { password: "correct horse battery staple" },
  });
  assert.equal(login.status, 200);
  assert.match(
    login.headers.get("set-cookie"),
    /HttpOnly; Secure; SameSite=Strict/,
  );
});
test("unauthorized admin requests and forged origins are rejected", async () => {
  assert.equal((await req("/api/admin/state", { cookie: "" })).status, 401);
  assert.equal(
    (
      await req("/api/admin/draft", {
        method: "PUT",
        origin: "https://evil.test",
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (await req("/api/admin/state", { surface: "public" })).status,
    404,
  );
});
test("draft isolation, publish, optimistic concurrency, and rollback", async () => {
  const draft = cloneDefaults();
  draft.welcome.title = "A private draft";
  const saved = await req("/api/admin/draft", {
    method: "PUT",
    body: { config: draft, revision: 1 },
  });
  assert.equal(saved.status, 200);
  assert.equal(
    (await (await req("/api/content", { surface: "public" })).json()).config
      .welcome.title,
    cloneDefaults().welcome.title,
  );
  assert.equal(
    (
      await req("/api/admin/draft", {
        method: "PUT",
        body: { config: draft, revision: 1 },
      })
    ).status,
    409,
  );
  assert.equal(
    (await req("/api/admin/publish", { method: "POST", body: { revision: 1 } }))
      .status,
    409,
  );
  const published = await (
    await req("/api/admin/publish", { method: "POST", body: { revision: 2 } })
  ).json();
  assert.ok(published.id);
  assert.equal(
    (await (await req("/api/content", { surface: "public" })).json()).config
      .welcome.title,
    "A private draft",
  );
  draft.welcome.title = "Changed again";
  await req("/api/admin/draft", {
    method: "PUT",
    body: { config: draft, revision: 2 },
  });
  const reverted = await (
    await req("/api/admin/revert", {
      method: "POST",
      body: { id: published.id, revision: 3 },
    })
  ).json();
  assert.equal(reverted.config.welcome.title, "A private draft");
  assert.equal(reverted.revision, 4);
});
test("R2 uploads remain private until published; ranges work; history protects media", async () => {
  const bytes = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 4, 5, 6, 7, 8]);
  const uploaded = await req("/api/admin/media", {
    method: "POST",
    raw: bytes,
    headers: { "content-type": "image/jpeg", "x-file-name": "memory.jpg" },
  });
  assert.equal(uploaded.status, 201);
  const m = await uploaded.json();
  assert.ok(env.MEDIA.objects.has(m.id));
  assert.equal((await req(m.src, { surface: "public" })).status, 404);
  assert.equal((await req(m.src, { cookie: "" })).status, 401);
  const c = cloneDefaults();
  c.gallery.items.push({ id: "a", src: m.src, caption: "Ours", date: "Today" });
  await req("/api/admin/draft", {
    method: "PUT",
    body: { revision: 1, config: c },
  });
  await req("/api/admin/publish", { method: "POST", body: { revision: 2 } });
  const range = await req(m.src, {
    surface: "public",
    headers: { range: "bytes=2-5" },
  });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), "bytes 2-5/12");
  assert.deepEqual(
    new Uint8Array(await range.arrayBuffer()),
    bytes.slice(2, 6),
  );
  assert.equal(
    (await req("/api/admin/media/" + m.id, { method: "DELETE" })).status,
    409,
  );
});
test("rejects disguised SVG and malformed images; deletes unused R2 assets", async () => {
  assert.equal(
    (
      await req("/api/admin/media", {
        method: "POST",
        raw: '<svg onload="alert(1)">',
        headers: { "content-type": "image/jpeg" },
      })
    ).status,
    415,
  );
  const m = await (
    await req("/api/admin/media", {
      method: "POST",
      raw: new Uint8Array([1, 2, 3, 4]),
      headers: { "content-type": "audio/mpeg" },
    })
  ).json();
  assert.equal(
    (await req("/api/admin/media/" + m.id, { method: "DELETE" })).status,
    200,
  );
  assert.equal(env.MEDIA.objects.has(m.id), false);
});
test("visitor password gates content and media; rotation invalidates visitor session", async () => {
  await req("/api/admin/security", {
    method: "PUT",
    body: { gatePassword: "visitor password" },
  });
  assert.equal((await req("/api/content", { surface: "public" })).status, 423);
  assert.equal(
    (
      await req("/api/unlock", {
        surface: "public",
        method: "POST",
        body: { password: "wrong" },
      })
    ).status,
    401,
  );
  const unlocked = await req("/api/unlock", {
      surface: "public",
      method: "POST",
      body: { password: "visitor password" },
    }),
    cookie = unlocked.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await req("/api/content", { surface: "public", cookie })).status,
    200,
  );
  await req("/api/admin/security", {
    method: "PUT",
    body: { gatePassword: "different password" },
  });
  assert.equal(
    (await req("/api/content", { surface: "public", cookie })).status,
    423,
  );
});
test("maintenance suppresses content, and rate limiter blocks repeated logins", async () => {
  const c = cloneDefaults();
  c.settings.maintenance = true;
  await req("/api/admin/draft", {
    method: "PUT",
    body: { revision: 1, config: c },
  });
  await req("/api/admin/publish", { method: "POST", body: { revision: 2 } });
  assert.equal((await req("/api/content", { surface: "public" })).status, 503);
  for (let i = 0; i < 8; i++)
    assert.equal(
      (
        await req("/api/auth/login", {
          method: "POST",
          body: { password: "bad" },
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await req("/api/auth/login", {
        method: "POST",
        body: { password: "bad" },
      })
    ).status,
    429,
  );
});
test("password change invalidates old admin sessions and logout revokes new session", async () => {
  const changed = await req("/api/admin/security", {
    method: "PUT",
    body: {
      currentPassword: "correct horse battery staple",
      newPassword: "a brand new long password",
    },
  });
  assert.equal(changed.status, 200);
  assert.equal((await req("/api/admin/state")).status, 401);
  const next = changed.headers.get("set-cookie").split(";")[0];
  assert.equal((await req("/api/admin/state", { cookie: next })).status, 200);
  await req("/api/auth/logout", { method: "POST", cookie: next, body: {} });
  assert.equal((await req("/api/admin/state", { cookie: next })).status, 401);
});
test("rich text removes executable tags, attributes, and unsafe asset references", () => {
  assert.equal(
    sanitizeRichText(
      '<p onclick="x()">Hello <strong style="x">love</strong><img src=x onerror=x></p>',
    ),
    "<p>Hello <strong>love</strong></p>",
  );
  assert.equal(
    sanitizeRichText("<img src=x onerror=alert(1) "),
    "&lt;img src=x onerror=alert(1) ",
  );
  const c = cloneDefaults();
  c.theme.backgroundImage = "javascript:alert(1)";
  assert.throws(() => validateConfig(c), /uploaded asset/);
});
test("frontends strip spoofed surface headers and public has no admin routes", async () => {
  const apiBinding = { fetch: (r) => api.fetch(r, env) };
  const publicSite = createFrontend("public", {}, "<title>LoveLetta</title>");
  assert.equal(
    (
      await publicSite.fetch(
        new Request("https://studio.test/api/admin/state", {
          headers: { "x-loveletta-surface": "editor", cookie: adminCookie },
        }),
        { API: apiBinding },
      )
    ).status,
    404,
  );
  const editor = createFrontend(
    "editor",
    {},
    "<title>Studio</title>",
    "<title>Preview</title>",
  );
  assert.equal(
    (
      await editor.fetch(new Request("https://studio.test/preview"), {
        API: apiBinding,
      })
    ).status,
    302,
  );
  const preview = await editor.fetch(
    new Request("https://studio.test/preview", {
      headers: { cookie: adminCookie },
    }),
    { API: apiBinding },
  );
  assert.equal(preview.status, 200);
  assert.match(
    preview.headers.get("content-security-policy"),
    /script-src 'self'/,
  );
});
test("archived publications can be deleted while current publication stays protected", async () => {
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO versions VALUES(?,?,?,?)")
    .bind(
      "old",
      JSON.stringify(cloneDefaults()),
      "2020-01-01T00:00:00.000Z",
      "Earlier version",
    )
    .run();
  await env.DB.prepare("INSERT INTO versions VALUES(?,?,?,?)")
    .bind("current", JSON.stringify(cloneDefaults()), now, "Current version")
    .run();
  await env.DB.prepare("UPDATE state SET published_at=?").bind(now).run();
  assert.equal(
    (await req("/api/admin/versions/old", { method: "DELETE" })).status,
    200,
  );
  assert.equal(
    (await req("/api/admin/versions/current", { method: "DELETE" })).status,
    409,
  );
});

test("MP4 backgrounds upload to R2, publish securely, and stream ranges", async () => {
  const bytes = Uint8Array.from([
    0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0,
  ]);
  const upload = await req("/api/admin/media", {
    method: "POST",
    raw: bytes,
    headers: { "content-type": "video/mp4", "x-file-name": "flowers.mp4" },
  });
  assert.equal(upload.status, 201);
  const media = await upload.json();
  const c = cloneDefaults();
  c.theme.transparent = true;
  c.theme.video.enabled = true;
  c.theme.video.src = media.src;
  assert.equal(
    (
      await req("/api/admin/draft", {
        method: "PUT",
        body: { config: c, revision: 1 },
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("/api/admin/publish", { method: "POST", body: { revision: 2 } }))
      .status,
    200,
  );
  const streamed = await req(media.src, {
    surface: "public",
    headers: { range: "bytes=4-7" },
  });
  assert.equal(streamed.status, 206);
  assert.equal(streamed.headers.get("content-type"), "video/mp4");
  assert.equal(await streamed.text(), "ftyp");
  assert.equal(
    (
      await req("/api/admin/media", {
        method: "POST",
        raw: "<html>bad</html>",
        headers: { "content-type": "video/mp4" },
      })
    ).status,
    415,
  );
});
test("legacy configuration gains video defaults and rejects unsafe video options", () => {
  const c = cloneDefaults();
  delete c.theme.video;
  assert.equal(validateConfig(c).theme.video.enabled, false);
  c.theme.video = { enabled: true, src: "https://untrusted.example/video.mp4" };
  assert.throws(() => validateConfig(c), /uploaded asset/);
  c.theme.video = { speed: 9 };
  assert.throws(() => validateConfig(c), /speed/);
});
test("visitor letters are isolated, retries are idempotent, and admin replies return only to their browser", async () => {
  const first = await req("/api/mail", { surface: "public", cookie: "" });
  assert.equal(first.status, 200);
  assert.match(
    first.headers.get("set-cookie"),
    /HttpOnly; Secure; SameSite=Strict/,
  );
  const visitorCookie = first.headers.get("set-cookie").split(";")[0];
  const other = await req("/api/mail", { surface: "public", cookie: "" });
  const otherCookie = other.headers.get("set-cookie").split(";")[0];
  const id = crypto.randomUUID();
  const send = () =>
    req("/api/mail", {
      surface: "public",
      cookie: visitorCookie,
      method: "POST",
      body: {
        requestId: id,
        name: "Their name",
        body: "A private little letter",
      },
    });
  assert.equal((await send()).status, 201);
  assert.equal((await send()).status, 200);
  assert.equal((await req("/api/admin/inbox", { cookie: "" })).status, 401);
  const threads = await (await req("/api/admin/inbox")).json();
  assert.equal(threads.length, 1);
  assert.equal(threads[0].unread, 1);
  const thread = threads[0].id;
  const read = await (await req("/api/admin/inbox/" + thread)).json();
  assert.equal(read.messages[0].body, "A private little letter");
  await req("/api/admin/inbox/" + thread + "/read", {
    method: "POST",
    body: {},
  });
  assert.equal((await (await req("/api/admin/inbox")).json())[0].unread, 0);
  const reply = crypto.randomUUID();
  assert.equal(
    (
      await req("/api/admin/inbox/" + thread + "/reply", {
        method: "POST",
        body: { requestId: reply, body: "A letter back" },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await req("/api/admin/inbox/" + thread + "/reply", {
        method: "POST",
        body: { requestId: reply, body: "A letter back" },
      })
    ).status,
    200,
  );
  let received = await (
    await req("/api/mail", { surface: "public", cookie: visitorCookie })
  ).json();
  assert.equal(received.messages.length, 2);
  assert.equal(received.messages.find((m) => m.id === reply).read_at, null);
  assert.equal(
    (
      await (
        await req("/api/mail", { surface: "public", cookie: otherCookie })
      ).json()
    ).messages.length,
    0,
  );
  await req("/api/mail/read", {
    surface: "public",
    cookie: otherCookie,
    method: "POST",
    body: { ids: [reply] },
  });
  assert.equal(
    (
      await (
        await req("/api/mail", { surface: "public", cookie: visitorCookie })
      ).json()
    ).messages.find((m) => m.id === reply).read_at,
    null,
  );
  await req("/api/mail/read", {
    surface: "public",
    cookie: visitorCookie,
    method: "POST",
    body: { ids: [reply] },
  });
  assert.ok(
    (
      await (
        await req("/api/mail", { surface: "public", cookie: visitorCookie })
      ).json()
    ).messages.find((m) => m.id === reply).read_at,
  );
});
test("mail rejects bots, invalid bodies, anonymous submissions and forged origins; sending is rate limited", async () => {
  assert.equal(
    (
      await req("/api/mail", {
        surface: "public",
        cookie: "",
        method: "POST",
        body: {},
      })
    ).status,
    401,
  );
  const cookie = (
    await req("/api/mail", { surface: "public", cookie: "" })
  ).headers
    .get("set-cookie")
    .split(";")[0];
  const send = (body, extra = {}) =>
    req("/api/mail", {
      surface: "public",
      cookie,
      method: "POST",
      body: { requestId: crypto.randomUUID(), body, ...extra },
    });
  assert.equal((await send("")).status, 400);
  assert.equal((await send("x".repeat(5001))).status, 400);
  assert.equal((await send("hi", { website: "spam" })).status, 400);
  assert.equal(
    (
      await req("/api/mail", {
        surface: "public",
        cookie,
        method: "POST",
        body: { requestId: crypto.randomUUID(), body: "hi" },
        origin: "https://evil.test",
      })
    ).status,
    403,
  );
  for (let i = 0; i < 5; i++)
    assert.equal((await send("Dear you")).status, 201);
  assert.equal((await send("Too many")).status, 429);
  env.DB.sql.exec(
    "UPDATE state SET published=json_set(published,'$.correspondence.enabled',json('false'))",
  );
  assert.equal(
    (await req("/api/mail", { surface: "public", cookie })).status,
    404,
  );
});
