import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", ".wrangler"].includes(e.name)) continue;
    const p = dir + "/" + e.name;
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(js|mjs)$/.test(p)) out.push(p);
  }
  return out;
}
const files = await walk(".");
for (const f of files) {
  const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
  if (r.status) {
    console.error(f, r.stderr);
    process.exit(1);
  }
}
const publicCode = await readFile("dist/public.js", "utf8");
if (
  publicCode.includes('data-action="publish"') ||
  publicCode.includes('data-tab="settings"')
)
  throw Error("Editor UI leaked into public bundle.");
console.log(
  `Syntax checked ${files.length} JavaScript modules. Public bundle contains no editor UI.`,
);
