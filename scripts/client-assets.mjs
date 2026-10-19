import { createHash } from "node:crypto";

// Version the whole browser module graph together, including nested imports.
// Changing a child module must invalidate a previously cached entry point.
export function versionClientAssets(assets, html, previewHtml = "", salt = "") {
  const revision = createHash("sha256")
    .update(JSON.stringify([assets, html, previewHtml, salt]))
    .digest("hex")
    .slice(0, 16);
  const version = (path) => `${path}?v=${revision}`;
  const output = Object.fromEntries(
    Object.entries(assets).map(([path, asset]) => [
      path,
      path.endsWith(".js")
        ? {
            ...asset,
            content: asset.content.replace(
              /((?:from\s+|import\s*\(\s*)["'])([^"']+\.js)(["'])/g,
              (match, prefix, target, suffix) =>
                /^(?:\.{1,2}\/|\/)/.test(target)
                  ? prefix + version(target) + suffix
                  : match,
            ),
          }
        : asset,
    ]),
  );
  const page = (source) =>
    source.replace(
      /((?:src|href)=")(\/[^"?]+\.(?:js|css))(")/g,
      (match, prefix, path, suffix) =>
        assets[path] ? prefix + version(path) + suffix : match,
    );
  return {
    assets: output,
    html: page(html),
    previewHtml: page(previewHtml),
    revision,
  };
}
