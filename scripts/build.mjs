import { readFile, writeFile, mkdir } from "node:fs/promises";
const read = (p) => readFile(p, "utf8");
await mkdir("dist", { recursive: true });
const validation = await read("shared/validation.js");
const backend = (await read("backend/worker.js")).replace(
  /import\s+\{[^}]+\}\s+from\s+['"]\.\.\/shared\/validation\.js['"];?/,
  validation.replace(/export /g, ""),
);
await writeFile(
  "dist/api.js",
  backend.replace(/export async function /g, "async function "),
);
const common = {
  "/music.js": {
    type: "application/javascript;charset=UTF-8",
    content: await read("shared/music.js"),
  },
  "/style.css": {
    type: "text/css;charset=UTF-8",
    content: await read("shared/style.css"),
  },
  "/render.js": {
    type: "application/javascript;charset=UTF-8",
    content: await read("shared/render.js"),
  },
  "/validation.js": {
    type: "application/javascript;charset=UTF-8",
    content: validation,
  },
  "/floral.svg": {
    type: "image/svg+xml",
    content: await read("shared/assets/floral.svg"),
  },
  "/favicon.svg": {
    type: "image/svg+xml",
    content:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#fcf1f1"/><path d="M32 48C-3 27 20 6 32 23 44 6 67 27 32 48" fill="#a94361"/><text x="32" y="39" text-anchor="middle" font-size="21" font-family="serif" fill="#fff7ef">L</text></svg>',
  },
};
const factory = (await read("shared/frontend.js")).replace(/export /g, "");
const pub = await read("apps/public/index.html");
for (const surface of ["public", "editor"]) {
  const assets = { ...common };
  if (surface === "public")
    assets["/app.js"] = {
      type: "application/javascript;charset=UTF-8",
      content: await read("apps/public/app.js"),
    };
  else
    for (const [route, file, type] of [
      ["/editor.js", "apps/editor/editor.js", "application/javascript"],
      ["/editor.css", "apps/editor/editor.css", "text/css"],
      ["/preview.js", "apps/editor/preview.js", "application/javascript"],
      ["/defaults.js", "shared/defaults.js", "application/javascript"],
    ])
      assets[route] = { type, content: await read(file) };
  const html =
    surface === "public" ? pub : await read("apps/editor/index.html");
  const preview = pub.replace('src="/app.js"', 'src="/preview.js"');
  await writeFile(
    `dist/${surface}.js`,
    `${factory}\nexport default createFrontend(${JSON.stringify(surface)},${JSON.stringify(assets)},${JSON.stringify(html)},${JSON.stringify(preview)});\n`,
  );
}
console.log("Built API, public site, and editor.");
