import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { cloneDefaults } from "../shared/defaults.js";
import { render } from "../shared/render.js";
function dom() {
  const { window } = parseHTML(
    '<!doctype html><html><head><title></title><meta name="description"><link rel="icon"></head><body><div id="app"></div><div id="petals"></div></body></html>',
  );
  Object.assign(globalThis, {
    window,
    document: window.document,
    matchMedia: () => ({ matches: true }),
    IntersectionObserver: class {
      observe(el) {
        el.classList.add("visible");
      }
      unobserve() {}
      disconnect() {}
    },
  });
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.HTMLElement.prototype.focus = function () {};
  return window;
}
test("envelope opens the complete letter and keyboard-accessible secret notes unfold", async () => {
  const window = dom(),
    c = cloneDefaults();
  c.correspondence.enabled = false;
  render(c);
  assert.match(document.querySelector("h1").textContent, /written with love/);
  assert.equal(
    document.querySelector(".letter-body").querySelectorAll("p").length,
    4,
  );
  assert.ok(document.querySelector(".letter-body blockquote"));
  document.querySelector(".envelope").click();
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(document.body.classList.contains("is-open"));
  const note = document.querySelector(".secret");
  note.click();
  assert.equal(note.getAttribute("aria-expanded"), "true");
  assert.match(note.textContent, /Being you is more than enough/);
  note.click();
  assert.equal(note.getAttribute("aria-expanded"), "false");
  assert.match(note.textContent, /For a quiet day/);
  assert.equal(document.querySelectorAll("#petals i").length, 0);
});
test("layout order, hidden modules, custom typography, and floral colors render from configuration", () => {
  dom();
  const c = cloneDefaults();
  c.correspondence.enabled = false;
  c.theme.fontSize = 24;
  c.theme.accent = "#bb4477";
  c.sections = [
    c.sections[3],
    c.sections[0],
    { ...c.sections[2], enabled: false },
  ];
  render(c, { preview: true, open: true });
  assert.equal(document.querySelector(".section").id, "surprises");
  assert.equal(document.querySelector("#timeline"), null);
  assert.match(
    document.querySelector(".preview-banner").textContent,
    /UNPUBLISHED/,
  );
  assert.equal(
    document.documentElement.style.getPropertyValue("--font-size"),
    "24px",
  );
  assert.equal(
    document.documentElement.style.getPropertyValue("--accent"),
    "#bb4477",
  );
  assert.match(document.querySelector(".floral").src, /color=%23e8a1b3/);
  assert.equal(document.querySelectorAll('a[href*="studio"]').length, 0);
});
test("letters and gallery captions escape markup; rich text strips executable attributes", () => {
  dom();
  const c = cloneDefaults();
  c.correspondence.enabled = false;
  c.welcome.title = "<img src=x onerror=alert(1)>";
  c.letters[0].body =
    '<p onclick="alert(1)">Safe <mark>love</mark><img src=x onerror=alert(1)></p>';
  c.gallery.items.push({
    id: "1",
    src: "/media/00000000-0000-0000-0000-000000000000",
    caption: "<script>bad()</script>",
    date: "Today",
  });
  render(c, { open: true });
  assert.equal(document.querySelector("h1 img"), null);
  assert.equal(document.querySelector(".letter-body [onclick]"), null);
  assert.equal(document.querySelector(".letter-body img"), null);
  assert.equal(document.querySelector(".letter-body mark").textContent, "love");
  assert.equal(document.querySelector("figcaption script"), null);
});
test("typewriter keeps full text accessible and builds progressive word animation", () => {
  dom();
  globalThis.matchMedia = () => ({ matches: false });
  const c = cloneDefaults();
  c.correspondence.enabled = false;
  c.writingAnimation = "typewriter";
  render(c, { open: true });
  assert.ok(document.querySelectorAll(".typed-word").length > 100);
  assert.match(
    document.querySelector(".letter-body").textContent,
    /I choose you/,
  );
  assert.equal(document.querySelectorAll(".petal").length, 14);
});

test("transparent video background honors reduced motion without fetching a video", () => {
  dom();
  const c = cloneDefaults();
  c.correspondence.enabled = false;
  c.theme.transparent = true;
  c.theme.video.enabled = true;
  c.theme.video.src = "/media/00000000-0000-0000-0000-000000000001";
  c.theme.video.poster = "/media/00000000-0000-0000-0000-000000000002";
  render(c);
  assert.ok(document.body.classList.contains("transparent-page"));
  assert.ok(document.querySelector(".video-backdrop"));
  assert.ok(document.querySelector(".background-poster"));
  assert.equal(document.querySelector("#background-video"), null);
  assert.equal(document.body.style.backgroundImage, "none");
});
test("video framing, speed, muted playback, and pause controls follow editor settings", () => {
  const window = dom();
  globalThis.matchMedia = () => ({ matches: false });
  window.HTMLElement.prototype.paused = true;
  window.HTMLElement.prototype.pause = function () {
    this.paused = true;
  };
  window.HTMLElement.prototype.play = function () {
    this.paused = false;
    return Promise.resolve();
  };
  window.HTMLElement.prototype.load = function () {};
  const c = cloneDefaults();
  c.correspondence.enabled = false;
  c.theme.video = {
    ...c.theme.video,
    enabled: true,
    src: "/media/00000000-0000-0000-0000-000000000001",
    autoplay: false,
    fit: "contain",
    position: "top",
    speed: 1.25,
  };
  render(c);
  const video = document.querySelector("#background-video");
  assert.ok(video);
  assert.equal(video.muted, true);
  assert.equal(video.playbackRate, 1.25);
  assert.equal(video.style.objectFit, "contain");
  assert.equal(video.style.objectPosition, "top");
  assert.ok(video.hasAttribute("playsinline"));
  const control = document.querySelector(".background-toggle");
  control.click();
  assert.equal(video.paused, false);
  control.click();
  assert.equal(video.paused, true);
});
