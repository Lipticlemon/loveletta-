import { validateConfig, referencedMedia } from "../shared/validation.js";
const encoder = new TextEncoder();
const json = (value, status = 200, headers = {}) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export async function hash(value) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function passwordHash(password, salt = crypto.randomUUID()) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return (
    salt +
    ":" +
    Array.from(new Uint8Array(bits), (x) =>
      x.toString(16).padStart(2, "0"),
    ).join("")
  );
}
async function verify(password, stored) {
  if (!stored) return false;
  const actual = await passwordHash(password, stored.split(":")[0]);
  return equal(actual, stored);
}
function equal(a, b) {
  const aa = encoder.encode(a),
    bb = encoder.encode(b);
  return aa.length === bb.length && crypto.subtle.timingSafeEqual(aa, bb);
}
const cookie = (req, name) =>
  req.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1) || "";
const cookieName = (kind) =>
  kind === "admin" ? "__Host-loveletta" : "__Host-garden";
const cookieHeader = (kind, token, age = 43200) =>
  `${cookieName(kind)}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
async function body(req, max = 260000) {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > max) fail("Request too large.", 413);
  const reader = req.body?.getReader();
  let parts = [],
    size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        fail("Request too large.", 413);
      }
      parts.push(value);
    }
  }
  const out = new Uint8Array(size);
  let n = 0;
  for (const v of parts) {
    out.set(v, n);
    n += v.length;
  }
  return out;
}
async function data(req) {
  try {
    return JSON.parse(new TextDecoder().decode(await body(req)));
  } catch (e) {
    if (e.status) throw e;
    fail("Invalid JSON.");
  }
}
async function credentials(env) {
  return env.DB.prepare("SELECT * FROM credentials WHERE id=1").first();
}
async function session(req, env, kind = "admin") {
  const token = cookie(req, cookieName(kind));
  if (!token) return null;
  const row = await env.DB.prepare(
    "SELECT * FROM sessions WHERE hash=? AND kind=? AND expires>?",
  )
    .bind(await hash(token), kind, Date.now())
    .first();
  if (row && kind === "visitor") {
    const cr = await credentials(env);
    if (row.gate_revision !== cr.gate_revision) return null;
  }
  return row;
}
async function createSession(env, kind = "admin") {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const c = await credentials(env);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires<?").bind(Date.now()),
    env.DB.prepare(
      "INSERT INTO sessions(hash,kind,expires,gate_revision) VALUES (?,?,?,?)",
    ).bind(await hash(token), kind, Date.now() + 43200000, c.gate_revision),
  ]);
  return cookieHeader(kind, token);
}
async function limit(req, env, bucket, max = 8) {
  const ip = req.headers.get("x-client-ip") || "unknown";
  const now = Date.now();
  const key = bucket + ":" + (await hash(ip));
  const row = await env.DB.prepare(
    "INSERT INTO attempts(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING count",
  )
    .bind(key, now + 900000, now, now)
    .first();
  if (row.count > max) fail("Too many attempts. Try again in 15 minutes.", 429);
}
async function publicAccess(req, env) {
  const c = await credentials(env);
  return !c.gate_password || (await session(req, env, "visitor"));
}
async function state(env) {
  return env.DB.prepare("SELECT * FROM state WHERE id=1").first();
}
async function requireAdmin(req, env) {
  if (!(await session(req, env))) fail("Please sign in to the editor.", 401);
}
export default {
  async fetch(req, env) {
    try {
      const url = new URL(req.url),
        path = url.pathname,
        method = req.method,
        surface = req.headers.get("x-loveletta-surface");
      if (!["public", "editor"].includes(surface))
        return json({ error: "Not found." }, 404);
      if (!["GET", "HEAD"].includes(method)) {
        if (req.headers.get("origin") !== url.origin)
          fail("Request origin rejected.", 403);
        if (!req.headers.get("x-loveletta-request"))
          fail("Request header required.", 403);
      }
      if (path === "/api/health")
        return json({
          ok: true,
          service: "LoveLetta",
          storage: env.MEDIA ? "R2" : "D1",
          surface,
        });
      if (surface === "editor" && path === "/api/auth/status")
        return json({
          authenticated: !!(await session(req, env)),
          setupRequired: !(await credentials(env)).password,
        });
      if (
        surface === "editor" &&
        path === "/api/auth/setup" &&
        method === "POST"
      ) {
        await limit(req, env, "setup");
        const b = await data(req),
          c = await credentials(env);
        if (
          c.password ||
          !c.setup_hash ||
          c.setup_expires < Date.now() ||
          !equal(await hash(String(b.token || "")), c.setup_hash)
        )
          fail("This setup link is invalid or has expired.", 403);
        if (
          typeof b.password !== "string" ||
          b.password.length < 14 ||
          b.password.length > 200
        )
          fail("Use a password of 14–200 characters.");
        const result = await env.DB.prepare(
          "UPDATE credentials SET password=?,setup_hash=NULL,setup_expires=NULL WHERE id=1 AND password IS NULL AND setup_hash=?",
        )
          .bind(await passwordHash(b.password), c.setup_hash)
          .run();
        if (!result.meta.changes)
          fail("Setup has already been completed.", 409);
        return json({ ok: true }, 200, {
          "Set-Cookie": await createSession(env),
        });
      }
      if (
        surface === "editor" &&
        path === "/api/auth/login" &&
        method === "POST"
      ) {
        await limit(req, env, "login");
        const b = await data(req),
          c = await credentials(env);
        if (
          typeof b.password !== "string" ||
          b.password.length > 200 ||
          !(await verify(b.password, c.password))
        )
          fail("Incorrect password.", 401);
        return json({ ok: true }, 200, {
          "Set-Cookie": await createSession(env),
        });
      }
      if (
        surface === "editor" &&
        path === "/api/auth/logout" &&
        method === "POST"
      ) {
        await env.DB.prepare("DELETE FROM sessions WHERE hash=?")
          .bind(await hash(cookie(req, cookieName("admin"))))
          .run();
        return json({ ok: true }, 200, {
          "Set-Cookie": cookieHeader("admin", "", 0),
        });
      }
      if (surface === "public" && path === "/api/unlock" && method === "POST") {
        await limit(req, env, "unlock", 10);
        const b = await data(req),
          c = await credentials(env);
        if (
          typeof b.password !== "string" ||
          b.password.length > 200 ||
          !(await verify(b.password, c.gate_password))
        )
          fail("That password did not open the garden.", 401);
        return json({ ok: true }, 200, {
          "Set-Cookie": await createSession(env, "visitor"),
        });
      }
      if (surface === "public" && path === "/api/content" && method === "GET") {
        if (!(await publicAccess(req, env))) return json({ locked: true }, 423);
        const s = await state(env),
          c = JSON.parse(s.published);
        if (c.settings.maintenance)
          return json(
            { maintenance: true, message: c.settings.maintenanceMessage },
            503,
          );
        return json({ config: c, publishedAt: s.published_at });
      }
      if (path.startsWith("/media/") && ["GET", "HEAD"].includes(method)) {
        const id = path.slice(7);
        if (!/^[a-f\d-]{36}$/.test(id)) fail("Media not found.", 404);
        if (surface === "editor") await requireAdmin(req, env);
        else {
          if (!(await publicAccess(req, env)))
            fail("This garden is private.", 401);
          const c = JSON.parse((await state(env)).published);
          if (c.settings.maintenance || !referencedMedia(c).has(path))
            fail("Media not found.", 404);
        }
        const m = await env.DB.prepare("SELECT * FROM media WHERE id=?")
          .bind(id)
          .first();
        if (!m) fail("Media not found.", 404);
        let bytes;
        if (m.storage === "r2") {
          if (!env.MEDIA) fail("Media storage is unavailable.", 503);
          const object = await env.MEDIA.get(id);
          if (!object) fail("Media not found.", 404);
          bytes = new Uint8Array(await object.arrayBuffer());
        } else {
          const rows = await env.DB.prepare(
            "SELECT content FROM media_chunks WHERE media_id=? ORDER BY part",
          )
            .bind(id)
            .all();
          bytes = new Uint8Array(m.size);
          let offset = 0;
          for (const row of rows.results) {
            const v = Uint8Array.from(atob(row.content), (c) =>
              c.charCodeAt(0),
            );
            bytes.set(v, offset);
            offset += v.length;
          }
        }
        let start = 0,
          end = bytes.length - 1,
          status = 200;
        const range = req.headers.get("range");
        if (range) {
          const r = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!r || (!r[1] && !r[2]))
            return new Response(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${bytes.length}` },
            });
          if (!r[1]) start = Math.max(0, bytes.length - Number(r[2]));
          else start = Number(r[1]);
          if (r[1] && r[2]) end = Math.min(end, Number(r[2]));
          if (start > end || start >= bytes.length)
            return new Response(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${bytes.length}` },
            });
          status = 206;
        }
        const headers = {
          "Content-Type": m.mime,
          "Content-Length": String(end - start + 1),
          "Cache-Control": "private, no-store",
          "Accept-Ranges": "bytes",
          "Content-Disposition": "inline",
          "X-Content-Type-Options": "nosniff",
        };
        if (status === 206)
          headers["Content-Range"] = `bytes ${start}-${end}/${bytes.length}`;
        return new Response(
          method === "HEAD" ? null : bytes.slice(start, end + 1),
          { status, headers },
        );
      }
      if (surface !== "editor" || !path.startsWith("/api/admin/"))
        return json({ error: "Not found." }, 404);
      await requireAdmin(req, env);
      if (path === "/api/admin/state" && method === "GET") {
        const s = await state(env);
        return json({
          config: JSON.parse(s.draft),
          revision: s.revision,
          publishedAt: s.published_at,
          publicUrl: env.PUBLIC_URL,
          gateEnabled: !!(await credentials(env)).gate_password,
          storage: env.MEDIA ? "R2" : "D1",
        });
      }
      if (path === "/api/admin/draft" && method === "PUT") {
        const b = await data(req);
        let c;
        try {
          c = validateConfig(b.config);
        } catch (e) {
          fail(e.message);
        }
        const r = await env.DB.prepare(
          "UPDATE state SET draft=?,revision=revision+1 WHERE id=1 AND revision=? RETURNING revision",
        )
          .bind(JSON.stringify(c), b.revision)
          .first();
        if (!r)
          fail(
            "Another editor saved changes. Reload before saving to avoid overwriting them.",
            409,
          );
        return json({ revision: r.revision });
      }
      if (path === "/api/admin/publish" && method === "POST") {
        const b = await data(req),
          id = crypto.randomUUID(),
          now = new Date().toISOString();
        const draftState = await state(env),
          draft = JSON.parse(draftState.draft);
        if (
          draft.gallery.items.some((x) => !x.src) ||
          draft.music.tracks.some((x) => !x.src)
        )
          fail(
            "Choose a file for each gallery memory and song before publishing.",
          );
        const refs = [...referencedMedia(draft)];
        for (const ref of refs) {
          if (
            !(await env.DB.prepare("SELECT id FROM media WHERE id=?")
              .bind(ref.slice(7))
              .first())
          )
            fail(
              "A selected media file is missing. Choose another asset in Media.",
            );
        }
        // Both statements run in a D1 transaction. A stale revision inserts no version and updates no content.
        const results = await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO versions(id,content,created_at,label) SELECT ?,draft,?,? FROM state WHERE id=1 AND revision=?",
          ).bind(
            id,
            now,
            String(b.label || "Published from editor").slice(0, 160),
            b.revision,
          ),
          env.DB.prepare(
            "UPDATE state SET published=draft,published_at=? WHERE id=1 AND revision=?",
          ).bind(now, b.revision),
        ]);
        if (!results[1].meta.changes)
          fail("Save your latest draft before publishing.", 409);
        return json({ ok: true, id, publishedAt: now });
      }
      if (path === "/api/admin/versions" && method === "GET")
        return json(
          (
            await env.DB.prepare(
              "SELECT id,created_at,label FROM versions ORDER BY created_at DESC LIMIT 100",
            ).all()
          ).results,
        );
      if (path.startsWith("/api/admin/versions/") && method === "DELETE") {
        const id = path.split("/").pop(),
          v = await env.DB.prepare("SELECT created_at FROM versions WHERE id=?")
            .bind(id)
            .first();
        if (!v) fail("Version not found.", 404);
        if (v.created_at === (await state(env)).published_at)
          fail(
            "Keep the current publication. Delete earlier archived versions instead.",
            409,
          );
        await env.DB.prepare("DELETE FROM versions WHERE id=?").bind(id).run();
        return json({ ok: true });
      }
      if (path === "/api/admin/revert" && method === "POST") {
        const b = await data(req),
          v = await env.DB.prepare("SELECT content FROM versions WHERE id=?")
            .bind(b.id)
            .first();
        if (!v) fail("Version not found.", 404);
        const c = validateConfig(JSON.parse(v.content));
        const r = await env.DB.prepare(
          "UPDATE state SET draft=?,revision=revision+1 WHERE id=1 AND revision=? RETURNING revision",
        )
          .bind(JSON.stringify(c), b.revision)
          .first();
        if (!r) fail("Draft changed. Reload and try again.", 409);
        return json({ config: c, revision: r.revision });
      }
      if (path === "/api/admin/security" && method === "PUT") {
        const b = await data(req);
        if (b.gatePassword !== undefined) {
          if (b.gatePassword && String(b.gatePassword).length < 8)
            fail("Use at least 8 characters for the visitor password.");
          if (String(b.gatePassword).length > 200) fail("Password too long.");
          await env.DB.prepare(
            "UPDATE credentials SET gate_password=?,gate_revision=gate_revision+1 WHERE id=1",
          )
            .bind(b.gatePassword ? await passwordHash(b.gatePassword) : null)
            .run();
        }
        if (b.newPassword !== undefined) {
          const c = await credentials(env);
          if (!(await verify(String(b.currentPassword || ""), c.password)))
            fail("Current editor password is incorrect.", 403);
          if (
            typeof b.newPassword !== "string" ||
            b.newPassword.length < 14 ||
            b.newPassword.length > 200
          )
            fail("Use 14–200 characters.");
          await env.DB.batch([
            env.DB.prepare("UPDATE credentials SET password=? WHERE id=1").bind(
              await passwordHash(b.newPassword),
            ),
            env.DB.prepare("DELETE FROM sessions WHERE kind='admin'"),
          ]);
          return json({ ok: true }, 200, {
            "Set-Cookie": await createSession(env),
          });
        }
        return json({ ok: true });
      }
      if (path === "/api/admin/media" && method === "GET")
        return json(
          (
            await env.DB.prepare(
              "SELECT * FROM media ORDER BY created_at DESC LIMIT 500",
            ).all()
          ).results,
        );
      if (path === "/api/admin/media" && method === "POST") {
        const mime = req.headers.get("content-type")?.split(";")[0];
        if (
          ![
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "audio/mpeg",
            "audio/mp4",
            "audio/ogg",
            "audio/wav",
            "audio/x-wav",
          ].includes(mime)
        )
          fail("Use JPEG, PNG, WebP, GIF, MP3, M4A, OGG, or WAV.", 415);
        const max = env.MEDIA ? 20 * 1024 * 1024 : 8 * 1024 * 1024,
          bytes = await body(req, max);
        if (!bytes.length) fail("Empty file.");
        if (mime.startsWith("image/") && bytes.length > 3 * 1024 * 1024)
          fail("Optimize images below 3 MB.");
        // Image magic checks prevent arbitrary HTML/SVG uploads disguised as images.
        const signature = [...bytes.slice(0, 12)];
        const valid =
          mime === "image/jpeg"
            ? signature[0] === 255 && signature[1] === 216
            : mime === "image/png"
              ? signature.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
              : mime === "image/webp"
                ? new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
                  new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
                : mime === "image/gif"
                  ? new TextDecoder()
                      .decode(bytes.slice(0, 6))
                      .startsWith("GIF8")
                  : true;
        if (!valid) fail("File content does not match its image type.", 415);
        const total = await env.DB.prepare(
          "SELECT COALESCE(SUM(size),0) AS total FROM media",
        ).first();
        if (!env.MEDIA && total.total + bytes.length > 64 * 1024 * 1024)
          fail(
            "D1 media limit reached (64 MB). Remove unused media or enable R2.",
            413,
          );
        const id = crypto.randomUUID(),
          name = decodeURIComponent(
            req.headers.get("x-file-name") || "Upload",
          ).slice(0, 180),
          folder = decodeURIComponent(
            req.headers.get("x-folder") || "General",
          ).slice(0, 80),
          now = new Date().toISOString();
        const statements = [
          env.DB.prepare(
            "INSERT INTO media(id,name,mime,size,folder,created_at,storage) VALUES (?,?,?,?,?,?,?)",
          ).bind(
            id,
            name,
            mime,
            bytes.length,
            folder,
            now,
            env.MEDIA ? "r2" : "d1",
          ),
        ];
        if (env.MEDIA)
          await env.MEDIA.put(id, bytes, {
            httpMetadata: { contentType: mime },
          });
        else
          for (let i = 0, part = 0; i < bytes.length; i += 98304, part++) {
            let s = "";
            for (const b of bytes.slice(i, i + 98304))
              s += String.fromCharCode(b);
            statements.push(
              env.DB.prepare(
                "INSERT INTO media_chunks(media_id,part,content) VALUES (?,?,?)",
              ).bind(id, part, btoa(s)),
            );
          }
        await env.DB.batch(statements);
        return json(
          {
            id,
            name,
            mime,
            size: bytes.length,
            folder,
            created_at: now,
            src: "/media/" + id,
          },
          201,
        );
      }
      if (
        path.startsWith("/api/admin/media/") &&
        ["DELETE", "PATCH"].includes(method)
      ) {
        const id = path.split("/").pop();
        const m = await env.DB.prepare("SELECT * FROM media WHERE id=?")
          .bind(id)
          .first();
        if (!m) fail("Media not found.", 404);
        if (method === "PATCH") {
          const b = await data(req);
          await env.DB.prepare("UPDATE media SET name=?,folder=? WHERE id=?")
            .bind(
              String(b.name || m.name).slice(0, 180),
              String(b.folder || m.folder).slice(0, 80),
              id,
            )
            .run();
          return json({ ok: true });
        }
        const s = await state(env),
          versions = await env.DB.prepare("SELECT content FROM versions").all();
        if (
          [
            s.draft,
            s.published,
            ...versions.results.map((x) => x.content),
          ].some((x) => referencedMedia(JSON.parse(x)).has("/media/" + id))
        )
          fail(
            "This asset is used by a draft, publication, or saved version. Replace or remove its references first; published history retains media for safe rollback.",
            409,
          );
        await env.DB.batch([
          env.DB.prepare("DELETE FROM media_chunks WHERE media_id=?").bind(id),
          env.DB.prepare("DELETE FROM media WHERE id=?").bind(id),
        ]);
        if (m.storage === "r2" && env.MEDIA) await env.MEDIA.delete(id);
        return json({ ok: true });
      }
      return json({ error: "Not found." }, 404);
    } catch (e) {
      if (!e.status)
        console.error(
          JSON.stringify({ event: "api_error", message: e.message }),
        );
      return json(
        {
          error: e.status
            ? e.message
            : "Something went wrong. Please try again.",
        },
        e.status || 500,
      );
    }
  },
};
