import { sanitizeRichText } from "./validation.js";
export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const asset = (v) => (/^\/media\/[a-f\d-]{36}$/.test(v || "") ? v : "");
let cleanup = () => {};
export function render(config, { preview = false, open = false } = {}) {
  cleanup();
  const c = config,
    t = c.theme,
    e = c.effects,
    root = document.documentElement;
  const vars = {
    bg: t.background,
    paper: t.paper,
    accent: t.accent,
    ink: t.text,
    muted: t.muted,
    flower: t.flower,
    leaf: t.leaf,
    heading: `'${t.headingFont}',Georgia,serif`,
    body: `'${t.bodyFont}',serif`,
    letter: `'${t.letterFont}',serif`,
    "font-size": t.fontSize + "px",
    radius: t.radius + "px",
    spacing: t.spacing + "px",
    "letter-width": t.letterWidth + "px",
    shadow: t.shadow + "px",
    border: t.border + "px",
  };
  root.style.setProperty("--floral-vw", (39 * e.size) / 18 + "vw");
  root.style.setProperty("--floral-size", (530 * e.size) / 18 + "px");
  root.style.setProperty("--floral-mobile", (250 * e.size) / 18 + "px");
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty("--" + k, v));
  document.body.className = [
    t.texture ? "texture" : "",
    t.dark ? "dark" : "",
    e.enabled && e.sway ? "sway" : "",
    !e.enabled ? "no-effects" : "",
    e.positions === "top" ? "effect-top" : "",
  ].join(" ");
  document.body.style.backgroundImage = asset(t.backgroundImage)
    ? `url('${asset(t.backgroundImage)}')`
    : t.gradient
      ? "radial-gradient(ellipse at 50% 10%,color-mix(in srgb,var(--flower) 6%,transparent),transparent 65%)"
      : "none";
  document.body.style.backgroundSize = "cover";
  document.title = c.settings.title;
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute("content", c.settings.description);
  document
    .querySelector('link[rel="icon"]')
    ?.setAttribute("href", asset(c.settings.favicon) || "/favicon.svg");
  let letter = c.letters.find((x) => x.id === c.activeLetter) || c.letters[0];
  let intervals = [];
  const title = esc(c.welcome.title).replace(/(love[.!?]?)$/i, "<em>$1</em>");
  const enabled = c.sections.filter((s) => s.enabled);
  const nav = enabled
    .filter((s) => ["letter", "gallery", "surprises"].includes(s.type))
    .slice(0, 3)
    .map(
      (s) =>
        `<a href="#${esc(s.id)}">${{ letter: "The letter", gallery: "Our moments", surprises: "Little surprises" }[s.type]}</a>`,
    )
    .join("");
  document.querySelector("#app").innerHTML =
    `${preview ? '<div class="preview-banner">UNPUBLISHED PREVIEW · ONLY VISIBLE TO YOU</div>' : ""}<header class="masthead"><a class="brand" href="#">LoveLetta<i aria-hidden="true">❧</i></a><nav class="nav" aria-label="Chapters">${nav}</nav><span class="mast-note">a little love, in every word</span></header><main id="main"><section class="welcome"><img class="floral" src="/floral.svg" alt="" fetchpriority="high"><img class="floral right" src="/floral.svg" alt=""><div class="welcome-inner rise-text"><p class="eyebrow">${esc(c.welcome.eyebrow)}</p><h1>${title}</h1><p class="welcome-subtitle">${esc(c.welcome.subtitle)}</p><div class="envelope-area"><button class="envelope" aria-label="${esc(c.welcome.button)}"><span class="envelope-paper">For ${esc(c.welcome.recipient)}</span><span class="envelope-flap"></span><span class="wax" aria-hidden="true">L</span></button></div><button class="open-label">${esc(c.welcome.button)}<span aria-hidden="true">↗</span></button><p class="small-note">${esc(c.welcome.note)}</p></div><div class="intro-foot">A LETTER TO KEEP. A LOVE TO REMEMBER.</div></section><div class="letter-journey">${enabled.map((s, i) => section(s, i + 1)).join("")}<footer class="closing"><span class="tiny-flower" aria-hidden="true">❧</span><p>${esc(c.settings.footer)}</p><small>WITH LOVE, ${esc(c.welcome.sender).toUpperCase()}</small></footer></div></main>${c.music.enabled && c.music.tracks.length ? '<div class="music-player ' + (c.music.design === "square" ? "square" : "") + '"><button id="music-toggle" aria-label="Play music">▶</button><div><span id="track-name"></span><small id="music-status">A SOUNDTRACK FOR US</small></div><audio id="audio" preload="metadata"></audio></div>' : ""}<dialog class="dialog" id="photo-dialog"><button aria-label="Close photograph">×</button><img alt=""><p></p></dialog>`;
  if (t.headingSize !== 92)
    document.querySelector(".welcome h1").style.fontSize =
      `clamp(44px,${t.headingSize / 14}vw,${t.headingSize}px)`;
  if (t.buttonStyle === "square")
    document
      .querySelectorAll(".primary,.music-player")
      .forEach((el) => (el.style.borderRadius = t.radius + "px"));
  document
    .querySelectorAll(".floral,.letter-art,.gallery-empty img")
    .forEach((el) => {
      el.src =
        "/floral.svg?color=" +
        encodeURIComponent(t.flower) +
        "&leaf=" +
        encodeURIComponent(t.leaf) +
        "&type=" +
        encodeURIComponent(e.type);
    });
  document.querySelectorAll(".section").forEach((el, i) => {
    const s = enabled[i];
    el.style.paddingBlock = `clamp(40px,${(s.spacing * t.spacing) / 100 / 14}vw,${(s.spacing * t.spacing) / 100}px)`;
    if (s.background) el.style.background = s.background;
  });
  let observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((x) => {
        if (x.isIntersecting) {
          x.target.classList.add("visible");
          observer.unobserve(x.target);
        }
      }),
    { threshold: 0.08 },
  );
  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
  let opened = false;
  function openLetter(scroll = true) {
    if (opened) return;
    opened = true;
    document.querySelector(".envelope-area").classList.add("opening");
    document.querySelector(".envelope").setAttribute("aria-expanded", "true");
    const wait = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 850;
    const timer = setTimeout(() => {
      document.body.classList.add("is-open");
      if (scroll) {
        const target = document.querySelector(".letter-journey .section");
        target?.scrollIntoView({ behavior: "smooth" });
        target?.setAttribute("tabindex", "-1");
        target?.focus({ preventScroll: true });
      }
    }, wait);
    intervals.push(timer);
    if (c.music.enabled) play();
  }
  document
    .querySelector(".envelope")
    .addEventListener("click", () => openLetter());
  document
    .querySelector(".open-label")
    .addEventListener("click", () => openLetter());
  document.querySelectorAll(".nav a").forEach((a) =>
    a.addEventListener("click", () => {
      if (!opened) {
        openLetter(false);
        intervals.push(
          setTimeout(
            () =>
              document
                .getElementById(a.hash.slice(1))
                ?.scrollIntoView({ behavior: "smooth" }),
            900,
          ),
        );
      }
    }),
  );
  if (
    c.writingAnimation === "typewriter" &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    let index = 0;
    function ink(node) {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) {
          const fragment = document.createDocumentFragment();
          for (const word of child.textContent.split(/(\s+)/)) {
            if (!word) continue;
            if (/^\s+$/.test(word)) {
              fragment.append(document.createTextNode(word));
              continue;
            }
            const span = document.createElement("span");
            span.className = "typed-word";
            span.textContent = word;
            span.style.setProperty(
              "--ink-delay",
              Math.min(index++ * 0.045, 25) + "s",
            );
            fragment.append(span);
          }
          child.replaceWith(fragment);
        } else if (child.nodeType === 1) ink(child);
      }
    }
    document.querySelectorAll(".letter-body").forEach(ink);
  }
  document.querySelectorAll("[data-letter]").forEach((button) =>
    button.addEventListener("click", () => {
      const next = c.letters.find((x) => x.id === button.dataset.letter);
      if (next) {
        c.activeLetter = next.id;
        render(c, { preview, open: true });
        setTimeout(
          () => document.getElementById("letter")?.scrollIntoView(),
          10,
        );
      }
    }),
  );
  document.querySelectorAll(".secret").forEach((b) =>
    b.addEventListener("click", () => {
      const note = c.surprises.items.find((n) => n.id === b.dataset.note);
      if (!note) return;
      const expanded = b.getAttribute("aria-expanded") === "true";
      b.setAttribute("aria-expanded", String(!expanded));
      b.classList.toggle("revealed", !expanded);
      b.innerHTML = expanded
        ? noteFront(note)
        : `<span class="secret-message">${esc(note.message)}</span><small>TAP TO FOLD AGAIN</small>`;
    }),
  );
  const dialog = document.querySelector("#photo-dialog");
  document.querySelectorAll("[data-photo]").forEach((b) =>
    b.addEventListener("click", () => {
      const photo = c.gallery.items.find((x) => x.id === b.dataset.photo);
      dialog.querySelector("img").src = asset(photo.src);
      dialog.querySelector("img").alt = photo.caption || "A shared memory";
      dialog.querySelector("p").textContent = photo.caption;
      dialog.showModal();
    }),
  );
  dialog
    .querySelector("button")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  const audio = document.querySelector("#audio"),
    musicButton = document.querySelector("#music-toggle");
  if (audio) {
    const track =
      c.music.tracks.find((x) => x.id === c.music.active) || c.music.tracks[0];
    audio.src = asset(track.src);
    audio.loop = c.music.loop;
    audio.volume = c.music.volume;
    document.querySelector("#track-name").textContent = track.name;
    audio.addEventListener("loadedmetadata", () => {
      if (c.music.start < audio.duration) audio.currentTime = c.music.start;
      else
        document.querySelector("#music-status").textContent =
          "START TIME EXCEEDS SONG LENGTH";
    });
    audio.addEventListener("play", () => {
      musicButton.textContent = "Ⅱ";
      musicButton.setAttribute("aria-label", "Pause music");
      document.querySelector("#music-status").textContent =
        "PLAYING, JUST FOR YOU";
    });
    audio.addEventListener("pause", () => {
      musicButton.textContent = "▶";
      musicButton.setAttribute("aria-label", "Play music");
    });
    audio.addEventListener(
      "error",
      () =>
        (document.querySelector("#music-status").textContent =
          "SONG UNAVAILABLE"),
    );
    musicButton.addEventListener("click", () =>
      audio.paused ? play() : audio.pause(),
    );
    if (c.music.mode === "entry" && !preview) play();
  }
  async function play() {
    if (!audio) return;
    try {
      await audio.play();
    } catch {
      document.querySelector("#music-status").textContent =
        "TAP PLAY FOR A LITTLE MUSIC";
    }
  }
  const petals = document.querySelector("#petals");
  if (petals) {
    petals.innerHTML = "";
    if (
      e.enabled &&
      e.petals &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const quantity =
        c.settings.performance === "gentle"
          ? Math.min(8, e.quantity)
          : e.quantity;
      for (let i = 0; i < quantity; i++) {
        const el = document.createElement("i");
        el.className = "petal";
        el.style.left = ((i * 97.13) % 100) + "%";
        el.style.width = e.size + "px";
        el.style.height = e.size * 1.3 + "px";
        el.style.opacity = e.intensity * 0.65;
        el.style.animationDuration = e.speed * (0.7 + (i % 5) * 0.14) + "s";
        el.style.animationDelay = -i * 2.7 + "s";
        el.style.setProperty(
          "--drift",
          (e.direction === "left" ? -1 : 1) * (80 + i * 9) + "px",
        );
        if (e.type === "cherry") el.style.borderRadius = "50% 50% 20% 50%";
        if (e.type === "rose") el.style.borderRadius = "80% 10% 60% 30%";
        petals.append(el);
      }
    }
  }
  if (!e.hearts)
    document.querySelectorAll(".heart").forEach((el) => (el.textContent = "❧"));
  if (!e.bloom)
    document
      .querySelectorAll(".bloom")
      .forEach((el) => el.classList.remove("bloom"));
  if (c.gallery.slideshow && c.gallery.items.length > 1) {
    let n = 0;
    const timer = setInterval(
      () => {
        if (document.visibilityState !== "visible" || !opened || dialog.open)
          return;
        const photos = [...document.querySelectorAll(".photo")];
        photos.forEach((p, i) => {
          p.style.opacity = i === n ? "1" : ".45";
        });
        n = (n + 1) % photos.length;
      },
      Math.max(2, c.gallery.interval) * 1000,
    );
    intervals.push(timer);
  }
  if (open) {
    opened = true;
    document.body.classList.add("is-open");
    document.querySelector(".envelope-area").classList.add("opening");
  }
  let pointerFrame = 0;
  const pointer = (event) => {
    if (pointerFrame || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    pointerFrame = requestAnimationFrame(() => {
      root.style.setProperty(
        "--pointer-shift",
        (event.clientX / innerWidth - 0.5) * 30 + "px",
      );
      pointerFrame = 0;
    });
  };
  if (e.enabled && e.petals)
    window.addEventListener("pointermove", pointer, { passive: true });
  cleanup = () => {
    window.removeEventListener("pointermove", pointer);
    if (pointerFrame) cancelAnimationFrame(pointerFrame);
    intervals.forEach(clearInterval);
    observer.disconnect();
    if (audio) audio.pause();
  };
  function noteFront(n) {
    return `<span class="heart" aria-hidden="true">${e.hearts ? "♡" : "❧"}</span><strong>${esc(n.label)}</strong><small>TAP TO UNFOLD</small>`;
  }
  function section(s, i) {
    let content = "";
    const chapter = String(i).padStart(2, "0");
    if (s.type === "letter")
      content = `<span class="chapter">${chapter} · A letter for you</span><h2 class="section-title">${esc(letter.title)}</h2><div class="letter-paper ${c.writingAnimation === "typewriter" ? "typewriter" : ""}"><img class="letter-art" src="/floral.svg" alt="" loading="lazy"><h3 class="letter-heading">${esc(letter.greeting)}</h3><div class="letter-body">${sanitizeRichText(letter.body)}</div><p class="signature">${esc(letter.signature)}</p><p class="sender">${esc(c.welcome.sender)}</p>${letter.postscript ? `<p class="postscript">${esc(letter.postscript)}</p>` : ""}</div>${c.letters.length > 1 ? `<div class="read-actions">${c.letters.map((l) => `<button class="text-button" data-letter="${esc(l.id)}">${esc(l.title)}</button>`).join("")}</div>` : ""}`;
    if (s.type === "gallery")
      content = `<span class="chapter">${chapter} · Our moments</span><h2 class="section-title">${esc(c.gallery.title)}</h2><p class="section-subtitle">${esc(c.gallery.subtitle)}</p>${c.gallery.items.length ? `<div class="gallery-grid ${c.gallery.style === "clean" ? "clean" : ""}">${c.gallery.items.map((p) => `<figure class="photo"><button data-photo="${esc(p.id)}" aria-label="Enlarge ${esc(p.caption || "photograph")}"><img loading="lazy" decoding="async" src="${asset(p.src)}" alt="${esc(p.caption || "A shared memory")}"></button><figcaption>${esc(p.caption)}</figcaption>${p.date ? `<time>${esc(p.date)}</time>` : ""}</figure>`).join("")}</div>` : '<div class="gallery-empty"><img src="/floral.svg" alt="" loading="lazy"><div><h3>Our story is still blooming.</h3><p>A place for all the moments we will want to remember, and all the beautiful ones still to come.</p></div></div>'}`;
    if (s.type === "timeline")
      content = `<span class="chapter">${chapter} · Our story</span><h2 class="section-title">${esc(c.timeline.title)}</h2><div class="timeline">${c.timeline.items.map((m) => `<article class="moment"><time>${esc(m.date)}</time><h3>${esc(m.title)}</h3><p>${esc(m.description)}</p></article>`).join("")}</div>`;
    if (s.type === "surprises")
      content = `<span class="chapter">${chapter} · Sealed with a little love</span><h2 class="section-title">${esc(c.surprises.title)}</h2><p class="section-subtitle">${esc(c.surprises.subtitle)}</p><div class="notes">${c.surprises.items.map((n) => `<button class="secret" data-note="${esc(n.id)}" aria-expanded="false">${noteFront(n)}</button>`).join("")}</div>`;
    if (s.type === "quote")
      content = `<span class="tiny-flower">❧</span><blockquote class="section-title">${esc(s.text || "In a world of passing things, you are my favorite constant.")}</blockquote>`;
    return `<section id="${esc(s.id)}" class="section aligned-${["left", "right"].includes(s.align) ? s.align : "center"} ${s.desktop === "narrow" ? "narrow" : ""} ${s.mobile === "single" ? "mobile-single" : ""} ${s.animation !== "none" ? "reveal" : ""} ${s.animation === "bloom" ? "bloom" : ""}">${content}</section>`;
  }
}
