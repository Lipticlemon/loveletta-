import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { cloneDefaults } from "../shared/defaults.js";
test("all thirteen editor sections load; controls persist into drafts; publishing uses saved revision", async () => {
  const { window } = parseHTML(
    '<html><head></head><body><div id="app"></div><div id="toast"></div></body></html>',
  );
  const config = cloneDefaults(),
    requests = [],
    uploadedMedia = [];
  config.sections.find((item) => item.type === "gallery").enabled = false;
  Object.assign(globalThis, {
    window,
    document: window.document,
    location: { hash: "", pathname: "/", origin: "https://studio.test" },
    history: { replaceState() {} },
    confirm: () => true,
    prompt: () => null,
  });
  const threadId = crypto.randomUUID();
  globalThis.fetch = async (path, opts = {}) => {
    requests.push({ path, opts });
    if (path === "/api/admin/inbox")
      return Response.json([
        {
          id: threadId,
          name: "Their name",
          preview: "A little letter",
          updated_at: new Date().toISOString(),
          unread: 1,
        },
      ]);
    if (path === "/api/admin/inbox/" + threadId)
      return Response.json({
        messages: [
          {
            id: crypto.randomUUID(),
            direction: "visitor",
            name: "Their name",
            body: "<img src=x onerror=alert(1)>",
            created_at: new Date().toISOString(),
          },
        ],
      });
    if (path === "/api/admin/media" && opts.method === "POST") {
      const id = crypto.randomUUID();
      const item = {
        id,
        src: "/media/" + id,
        name: "memory.gif",
        mime: opts.headers["Content-Type"],
        size: 6,
        folder: "Memories",
      };
      uploadedMedia.push(item);
      return Response.json(item, { status: 201 });
    }
    if (path === "/api/admin/media") return Response.json(uploadedMedia);
    const data =
      path === "/api/auth/status"
        ? { authenticated: true }
        : path === "/api/admin/state"
          ? {
              config,
              revision: 1,
              publishedAt: new Date().toISOString(),
              publicUrl: "https://public.test",
              storage: "R2",
              gateEnabled: false,
            }
          : path === "/api/admin/media" ||
              path === "/api/admin/versions" ||
              path === "/api/admin/inbox"
            ? []
            : path === "/api/admin/draft"
              ? { revision: 2 }
              : path === "/api/admin/publish"
                ? { id: "v", publishedAt: new Date().toISOString() }
                : { ok: true };
    return Response.json(data);
  };
  let source = await readFile(
    new URL("../apps/editor/editor.js", import.meta.url),
    "utf8",
  );
  for (const name of ["defaults", "render", "validation", "music"])
    source = source.replace(
      new RegExp(`(['\"])/${name}\\.js\\1`, "g"),
      JSON.stringify(new URL(`../shared/${name}.js`, import.meta.url).href),
    );
  const fixture = new URL("./editor-runtime.local.mjs", import.meta.url);
  await writeFile(fixture, source);
  try {
    await import(fixture.href);
  } finally {
    await unlink(fixture);
  }
  await new Promise((r) => setTimeout(r, 15));
  assert.ok(document.querySelector(".studio"));
  assert.equal(document.querySelectorAll(".sidebar .tab").length, 13);
  for (const id of [
    "letters",
    "inbox",
    "theme",
    "flowers",
    "music",
    "gallery",
    "timeline",
    "surprises",
    "layout",
    "media",
    "settings",
    "history",
    "dashboard",
  ]) {
    document.querySelector(`.tab[data-tab="${id}"]`).click();
    assert.ok(document.querySelector("#controls .panel"), id);
    assert.match(document.querySelector("#page-heading").textContent, /./);
  }
  document.querySelector('.tab[data-tab="inbox"]').click();
  await new Promise((r) => setTimeout(r, 10));
  document.querySelector('[data-action="open-thread"]').click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(document.querySelector(".inbox-note img"), null);
  document.querySelector("#inbox-reply").value = "My loving reply";
  document.querySelector('[data-action="send-reply"]').click();
  await new Promise((r) => setTimeout(r, 10));
  const sentReply = requests.find((r) => r.path.endsWith("/reply"));
  assert.equal(JSON.parse(sentReply.opts.body).body, "My loving reply");
  document.querySelector('.tab[data-tab="gallery"]').click();
  const photos = document.querySelector("#gallery-upload");
  assert.ok(photos.hasAttribute("multiple"));
  photos.files = [
    new File(["GIF89a"], "Our day.gif", { type: "image/gif" }),
    new File(["GIF89a"], "Our trip.gif", { type: "image/gif" }),
  ];
  photos.dispatchEvent(new window.Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(document.querySelectorAll(".collection-item").length, 2);
  assert.match(
    document.querySelector("#toast").textContent,
    /Publish to show them/,
  );
  document.querySelector('.tab[data-tab="theme"]').click();
  const videoUpload = document.querySelector("#video-upload");
  assert.ok(videoUpload);
  videoUpload.files = [new File(["ftyp"], "Garden.mp4", { type: "video/mp4" })];
  videoUpload.dispatchEvent(new window.Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  const overlay = document.querySelector('[data-path="theme.video.overlay"]');
  overlay.value = "0.35";
  overlay.dispatchEvent(new window.Event("input", { bubbles: true }));
  document.querySelector('.tab[data-tab="music"]').click();
  const songUpload = document.querySelector("#music-upload");
  songUpload.files = [
    new File(["ID3"], "Our song.mp3", { type: "audio/mpeg" }),
    new File(["ID3"], "Another song.mp3", { type: "audio/mpeg" }),
  ];
  songUpload.dispatchEvent(new window.Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  const clipStart = document.querySelector(
      '[data-time-path="music.tracks.0.start"]',
    ),
    clipEnd = document.querySelector('[data-time-path="music.tracks.0.end"]');
  clipStart.value = "0:45";
  clipStart.dispatchEvent(new window.Event("input", { bubbles: true }));
  clipEnd.value = "1:30";
  clipEnd.dispatchEvent(new window.Event("input", { bubbles: true }));
  const lyrics = document.querySelector('[data-path="music.tracks.0.lyrics"]');
  lyrics.value = "[00:45.00]A little lyric";
  lyrics.dispatchEvent(new window.Event("input", { bubbles: true }));
  const start = document.querySelector('[data-path="music.start"]');
  start.value = "75.5";
  start.dispatchEvent(new window.Event("input", { bubbles: true }));
  document.querySelector('[data-action="save"]').click();
  await new Promise((r) => setTimeout(r, 10));
  const saved = requests.find((r) => r.path === "/api/admin/draft");
  assert.equal(JSON.parse(saved.opts.body).config.music.start, 75.5);
  const draft = JSON.parse(saved.opts.body).config;
  assert.equal(draft.gallery.items.length, 2);
  assert.equal(draft.music.tracks.length, 2);
  assert.equal(draft.music.tracks[0].start, 45);
  assert.equal(draft.music.tracks[0].end, 90);
  assert.equal(draft.music.tracks[0].lyrics, "[00:45.00]A little lyric");
  assert.equal(draft.music.enabled, true);
  assert.equal(draft.theme.transparent, true);
  assert.equal(draft.theme.video.enabled, true);
  assert.equal(draft.theme.video.overlay, 0.35);
  assert.match(draft.theme.video.src, /^\/media\//);
  assert.equal(draft.gallery.items[0].caption, "Our day");
  assert.match(draft.gallery.items[0].src, /^\/media\//);
  assert.equal(
    draft.sections.find((item) => item.type === "gallery").enabled,
    true,
  );
  document.querySelector('[data-action="publish"]').click();
  await new Promise((r) => setTimeout(r, 10));
  const pub = requests.find((r) => r.path === "/api/admin/publish");
  assert.equal(JSON.parse(pub.opts.body).revision, 2);
});
