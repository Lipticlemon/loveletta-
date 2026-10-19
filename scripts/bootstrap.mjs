import { readFile } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { cloneDefaults } from "../shared/defaults.js";
const account = process.env.CLOUDFLARE_ACCOUNT_ID,
  apiToken = process.env.CLOUDFLARE_API_TOKEN,
  database = process.env.LOVELETTA_DATABASE_ID,
  editorUrl = process.env.LOVELETTA_EDITOR_URL;
if (!account || !apiToken || !database || !editorUrl)
  throw Error(
    "Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, LOVELETTA_DATABASE_ID, and LOVELETTA_EDITOR_URL.",
  );
async function query(body) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const d = await r.json();
  if (!d.success) throw Error(JSON.stringify(d.errors));
  return d.result;
}
await query({
  sql: await readFile(
    new URL("../backend/schema.sql", import.meta.url),
    "utf8",
  ),
});
const current = await query({ sql: "SELECT id FROM state WHERE id=1" });
if (current[0]?.results?.length)
  throw Error(
    "This database is already initialized. Refusing to overwrite content or credentials.",
  );
const token = randomBytes(32).toString("base64url"),
  hashed = createHash("sha256").update(token).digest("hex"),
  content = JSON.stringify(cloneDefaults()),
  now = new Date().toISOString();
await query({
  batch: [
    {
      sql: "INSERT INTO state VALUES(1,?,?,1,?)",
      params: [content, content, now],
    },
    {
      sql: "INSERT INTO credentials(id,setup_hash,setup_expires) VALUES(1,?,?)",
      params: [hashed, String(Date.now() + 172800000)],
    },
    {
      sql: "INSERT INTO versions(id,content,created_at,label) VALUES(?,?,?,?)",
      params: ["initial-garden", content, now, "The original garden"],
    },
  ],
});
console.log(
  "Keep this single-use setup URL private. It expires in 48 hours:\n" +
    editorUrl +
    "/#setup=" +
    token,
);
