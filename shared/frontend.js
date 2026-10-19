export const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'self'",
};
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function createFrontend(surface, assets, html, previewHtml = "") {
  return {
    async fetch(request, env) {
      try {
        const url = new URL(request.url),
          path = url.pathname,
          headers = new Headers(securityHeaders);
        if (surface === "editor")
          headers.set("X-Robots-Tag", "noindex, nofollow");
        if (request.method === "OPTIONS")
          return new Response(null, { status: 405, headers });
        async function proxy(pathname = path) {
          const u = new URL(request.url);
          u.pathname = pathname;
          const h = new Headers(request.headers);
          h.set("x-loveletta-surface", surface);
          h.set(
            "x-client-ip",
            request.headers.get("cf-connecting-ip") || "unknown",
          );
          return env.API.fetch(
            new Request(u, {
              method: request.method,
              headers: h,
              body: ["GET", "HEAD"].includes(request.method)
                ? undefined
                : request.body,
              redirect: "manual",
            }),
          );
        }
        if (path.startsWith("/api/") || path.startsWith("/media/")) {
          const publicAllowed =
            path.startsWith("/media/") ||
            [
              "/api/content",
              "/api/unlock",
              "/api/health",
              "/api/mail",
              "/api/mail/read",
            ].includes(path);
          if (surface === "public" && !publicAllowed)
            return new Response("Not found", { status: 404, headers });
          const upstream = await proxy();
          const response = new Response(upstream.body, upstream);
          Object.entries(securityHeaders).forEach(([k, v]) =>
            response.headers.set(k, v),
          );
          if (surface === "editor")
            response.headers.set("X-Robots-Tag", "noindex, nofollow");
          return response;
        }
        if (!["GET", "HEAD"].includes(request.method))
          return new Response("Method not allowed", { status: 405, headers });
        if (path === "/robots.txt") {
          headers.set("Content-Type", "text/plain");
          return new Response(
            surface === "editor"
              ? "User-agent: *\nDisallow: /"
              : "User-agent: *\nAllow: /",
            { headers },
          );
        }
        if (path === "/preview" && surface === "editor") {
          const auth = await proxy("/api/auth/status");
          if (!(await auth.json()).authenticated)
            return new Response(null, {
              status: 302,
              headers: { ...securityHeaders, Location: "/" },
            });
          headers.set("Content-Type", "text/html;charset=UTF-8");
          headers.set("Cache-Control", "no-store");
          return new Response(request.method === "HEAD" ? null : previewHtml, {
            headers,
          });
        }
        if (path === "/" || path === "/index.html") {
          let page = html;
          let status = 200;
          if (surface === "public") {
            const content = await proxy("/api/content");
            const d = await content.json();
            if (d.maintenance) status = 503;
            if (d.config) {
              const s = d.config.settings;
              page = page
                .replace(
                  /<title>[^<]*<\/title>/,
                  `<title>${esc(s.title)}</title>`,
                )
                .replace(
                  /<meta name="description"[^>]*>/,
                  `<meta name="description" content="${esc(s.description)}">`,
                )
                .replace(
                  /<meta property="og:title"[^>]*>/,
                  `<meta property="og:title" content="${esc(s.title)}">`,
                )
                .replace(
                  /<meta property="og:description"[^>]*>/,
                  `<meta property="og:description" content="${esc(s.description)}">`,
                );
              if (s.socialImage)
                page = page.replace(
                  "</head>",
                  `<meta property="og:image" content="${esc(url.origin + s.socialImage)}"></head>`,
                );
              if (s.favicon)
                page = page.replace(
                  'href="/favicon.svg"',
                  `href="${esc(s.favicon)}"`,
                );
            }
          }
          headers.set("Content-Type", "text/html;charset=UTF-8");
          headers.set("Cache-Control", "no-store");
          return new Response(request.method === "HEAD" ? null : page, {
            status,
            headers,
          });
        }
        if (assets[path]) {
          const { content, type } = assets[path];
          headers.set("Content-Type", type);
          headers.set("Cache-Control", "public, max-age=300");
          let output = content;
          if (path === "/floral.svg")
            output = tintFloral(
              content,
              url.searchParams.get("color"),
              url.searchParams.get("leaf"),
              url.searchParams.get("type"),
            );
          return new Response(request.method === "HEAD" ? null : output, {
            headers,
          });
        }
        return new Response("Not found", { status: 404, headers });
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "frontend_error",
            surface,
            message: error.message,
          }),
        );
        return new Response("The garden needs a moment. Please refresh.", {
          status: 503,
          headers: { ...securityHeaders, "Content-Type": "text/plain" },
        });
      }
    },
  };
}
function tintFloral(svg, color, leaf, type) {
  const valid = (v) => /^#[a-f\d]{6}$/i.test(v || "");
  const blend = (hex, target, amount) =>
    "#" +
    [0, 1, 2]
      .map((i) =>
        Math.round(
          parseInt(hex.slice(i * 2 + 1, i * 2 + 3), 16) * (1 - amount) +
            target * amount,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  if (valid(color))
    for (const [from, to] of [
      ["#efb5bf", blend(color, 255, 0.2)],
      ["#e89bb0", color],
      ["#cc758e", blend(color, 0, 0.15)],
      ["#bc5d7b", blend(color, 0, 0.25)],
      ["#df93a6", blend(color, 0, 0.04)],
      ["#be6981", blend(color, 0, 0.25)],
      ["#b35b75", blend(color, 0, 0.3)],
      ["#ffe6e5", blend(color, 255, 0.65)],
      ["#fce6e2", blend(color, 255, 0.7)],
    ])
      svg = svg.split(from).join(to);
  if (valid(leaf))
    for (const [from, to] of [
      ["#bec3a0", blend(leaf, 255, 0.4)],
      ["#6b8467", blend(leaf, 0, 0.15)],
      ["#87947a", leaf],
    ])
      svg = svg.split(from).join(to);
  if (type === "cherry")
    svg = svg.replace(
      /<ellipse([^>]*?)rx="([\d.]+)"([^>]*?)ry="([\d.]+)"/g,
      (_, a, rx, b, ry) =>
        `<ellipse${a}rx="${Number(rx) * 0.65}"${b}ry="${Number(ry) * 0.8}"`,
    );
  if (type === "rose") svg = svg.replace(/opacity=".96"/g, 'opacity=".87"');
  return svg;
}
