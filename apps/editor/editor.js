import { parseTime, formatTime } from "/music.js";
import { cloneDefaults } from "/defaults.js";
import { esc } from "/render.js";
import {
  sanitizeRichText,
  validateConfig,
  videoDefaults,
} from "/validation.js";
let editSequence = 0;
let config,
  revision,
  meta,
  media = [],
  versions = [],
  tab = "dashboard",
  dirty = false,
  saving = false,
  letterIndex = 0,
  previewTimer,
  toastTimer,
  setupToken = new URLSearchParams(location.hash.slice(1)).get("setup");
if (setupToken) history.replaceState(null, "", location.pathname);
const app = document.querySelector("#app");
const tabs = [
  ["dashboard", "◈", "Overview"],
  ["letters", "✎", "Love letters"],
  ["theme", "◐", "Theme & typography"],
  ["flowers", "❧", "Flowers & motion"],
  ["music", "♫", "Music"],
  ["gallery", "▧", "Photo gallery"],
  ["timeline", "⋮", "Our timeline"],
  ["surprises", "♡", "Little surprises"],
  ["layout", "▤", "Page layout"],
  ["media", "▦", "Media library"],
  ["settings", "⚙", "Settings & security"],
  ["history", "↶", "Publishing history"],
];
const titles = {
  dashboard: [
    "A little love, beautifully made.",
    "Welcome to your studio. This is where your love story comes to life.",
  ],
  letters: [
    "Every word, from the heart.",
    "Write something they will want to read over and over again.",
  ],
  theme: [
    "Set the feeling.",
    "Colors, paper, and typography — make every detail yours.",
  ],
  flowers: [
    "Let your garden bloom.",
    "A little movement. A little magic. Always with a gentle touch.",
  ],
  music: [
    "Give your story a soundtrack.",
    "The right song makes a memory feel a little closer.",
  ],
  gallery: [
    "Keep the lovely little moments.",
    "Photographs to hold on to. A scrapbook that keeps growing.",
  ],
  timeline: [
    "A story only you can tell.",
    "Collect the small beginnings and the beautiful milestones.",
  ],
  surprises: [
    "Something just for them.",
    "Leave little notes to discover along the way.",
  ],
  layout: [
    "A place for every feeling.",
    "Arrange your chapters. Let the story unfold in your own way.",
  ],
  media: [
    "Your collection of little treasures.",
    "Photos, songs, backgrounds, and everything that makes it personal.",
  ],
  settings: [
    "The finishing touches.",
    "Privacy, sharing, backups, and the little details behind the scenes.",
  ],
  history: [
    "Every version, kept with love.",
    "Restore a previous publication as a draft, preview it, then publish when ready.",
  ],
};
const get = (path, obj = config) =>
  path.split(".").reduce((o, k) => o?.[k], obj);
const set = (path, value) => {
  let keys = path.split("."),
    obj = config;
  for (const k of keys.slice(0, -1)) obj = obj[k];
  obj[keys.at(-1)] = value;
  changed();
};
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 5000);
}
async function api(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      ...(body && !(body instanceof Blob)
        ? { "Content-Type": "application/json" }
        : {}),
      "X-Loveletta-Request": "1",
      ...headers,
    },
    body:
      body === undefined
        ? undefined
        : body instanceof Blob
          ? body
          : JSON.stringify(body),
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok) {
    if (response.status === 401 && config) {
      config = null;
      login(false);
    }
    throw Error(value.error || "Something went wrong.");
  }
  return value;
}
function changed() {
  editSequence++;
  dirty = true;
  status();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(sendPreview, 180);
}
function status() {
  const s = document.querySelector(".save-status");
  if (s)
    s.innerHTML = `<span class="status-dot" style="background:${dirty ? "#c79572" : "#80a58b"}"></span>${saving ? "Saving…" : dirty ? "Unsaved changes" : "Draft saved"}`;
}
function sendPreview() {
  const frame = document.querySelector("#preview");
  frame?.contentWindow?.postMessage(
    { type: "LOVELETTA_PREVIEW", config },
    location.origin,
  );
}
async function save() {
  if (saving) return;
  syncMusicTimes();
  validateConfig(config);
  saving = true;
  const savedSequence = editSequence;
  status();
  try {
    const result = await api("/api/admin/draft", {
      method: "PUT",
      body: { config, revision },
    });
    revision = result.revision;
    dirty = editSequence !== savedSequence;
    status();
    return true;
  } finally {
    saving = false;
    status();
  }
}
async function publish() {
  if (saving) return;
  const button = document.querySelector('[data-action="publish"]');
  button.disabled = true;
  document.querySelector("#controls").classList.add("busy-cover");
  try {
    await save();
    if (dirty)
      throw Error(
        "Your draft changed while saving. Save again before publishing.",
      );
    const result = await api("/api/admin/publish", {
      method: "POST",
      body: { revision, label: "Published from LoveLetta Studio" },
    });
    meta.publishedAt = result.publishedAt;
    versions = await api("/api/admin/versions");
    toast("Your love letter is live. Beautifully done.");
    if (tab === "dashboard" || tab === "history") showTab(tab);
  } catch (e) {
    toast(e.message);
  } finally {
    button.disabled = false;
    document.querySelector("#controls")?.classList.remove("busy-cover");
  }
}
async function init() {
  try {
    const auth = await api("/api/auth/status");
    if (!auth.authenticated) {
      login(auth.setupRequired);
      return;
    }
    await load();
  } catch (e) {
    app.innerHTML = `<div class="gate"><h1>The studio needs a moment.</h1><p>${esc(e.message)}</p><button id="retry" class="primary">Try again</button></div>`;
    document.querySelector("#retry").onclick = init;
  }
}
async function load() {
  [meta, media, versions] = await Promise.all([
    api("/api/admin/state"),
    api("/api/admin/media"),
    api("/api/admin/versions"),
  ]);
  config = meta.config;
  config.theme.video = { ...videoDefaults, ...config.theme.video };
  revision = meta.revision;
  dirty = false;
  studio();
}
function login(needsSetup) {
  const setup = needsSetup && setupToken;
  app.innerHTML = `<div class="login-layout"><section class="login-art"><img src="/floral.svg" alt=""><img class="right" src="/floral.svg" alt=""><div class="login-copy"><h1>Beautiful things<br>begin with love.</h1><p>A private little studio for the words, memories, and moments that matter.</p></div></section><section class="login-form-wrap"><form class="login-form" id="login"><span class="brand">LoveLetta <i>❧</i></span><h2>${setup ? "Your story starts here." : "Welcome to your studio."}</h2><p>${setup ? "Choose a strong password to make this space yours. Your setup link can only be used once." : needsSetup ? "Use your private setup link to create your editor password." : "A little key to your own corner of the world."}</p>${!needsSetup || setup ? `<div class="field"><label for="password">${setup ? "Create your password" : "Editor password"}</label><input id="password" type="password" autocomplete="${setup ? "new-password" : "current-password"}" minlength="${setup ? 14 : 1}" maxlength="200" required ${setup ? 'placeholder="At least 14 characters"' : ""}></div>${setup ? '<div class="field"><label for="confirm">Confirm your password</label><input id="confirm" type="password" minlength="14" maxlength="200" required autocomplete="new-password"></div>' : ""}<button class="btn rose" type="submit">${setup ? "Create my private studio" : "Open my studio"} <span>↗</span></button>` : ""}<p class="login-error" role="alert" id="login-error"></p><p class="login-hint">PRIVATE BY DESIGN<br>This editor is separate from your public love letter. Keep your password and setup link to yourself.</p></form></section></div>`;
  document.querySelector("#login").onsubmit = async (event) => {
    event.preventDefault();
    const password = document.querySelector("#password")?.value;
    if (!password) return;
    if (setup && document.querySelector("#confirm").value !== password) {
      document.querySelector("#login-error").textContent =
        "Your passwords do not match.";
      return;
    }
    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      await api(setup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        body: { password, ...(setup ? { token: setupToken } : {}) },
      });
      setupToken = null;
      await load();
    } catch (e) {
      document.querySelector("#login-error").textContent = e.message;
    } finally {
      button.disabled = false;
    }
  };
}
function studio() {
  app.innerHTML = `<div class="studio"><aside class="sidebar"><a class="brand" href="#">LoveLetta<i>❧</i></a><div class="studio-label">YOUR PRIVATE STUDIO</div><nav aria-label="Studio sections">${tabs.map(([id, icon, label], i) => `${i === 1 ? '<p class="nav-group">MAKE IT YOURS</p>' : i === 9 ? '<p class="nav-group">BEHIND THE SCENES</p>' : ""}<button class="tab ${tab === id ? "active" : ""}" data-tab="${id}"><span aria-hidden="true">${icon}</span>${label}</button>`).join("")}</nav><div class="sidebar-bottom"><div class="side-note"><strong>A little reminder.</strong>The most beautiful words are the ones that sound like you.</div><button class="logout" data-action="logout">↪ &nbsp; Sign out securely</button></div></aside><div class="workspace"><header class="studio-top"><button class="menu-toggle" data-action="menu" aria-label="Toggle studio navigation">☰</button><div class="crumb">Your studio &nbsp; / &nbsp; <strong id="crumb">Overview</strong></div><div class="top-actions"><span class="save-status"></span><a class="btn" href="${esc(meta.publicUrl)}" target="_blank" rel="noopener noreferrer">View site ↗</a><button class="btn" data-action="save">Save draft</button><button class="btn rose" data-action="publish">Publish ↗</button></div></header><div class="studio-body"><div id="page-heading"></div><div class="editor-grid"><div id="controls"></div><aside class="preview-panel"><div class="preview-toolbar"><strong>Live preview</strong><div class="device-buttons"><button class="active" data-device="desktop">Desktop</button><button data-device="mobile">Mobile</button><a class="btn small" href="/preview" target="_blank" rel="noopener">↗</a></div></div><div class="preview-frame-wrap"><iframe id="preview" title="Unpublished website preview" src="/preview"></iframe></div><p class="preview-caption">CHANGES STAY PRIVATE UNTIL YOU PUBLISH</p></aside></div></div></div></div>`;
  document.querySelector("#preview").addEventListener("load", sendPreview);
  showTab(tab);
  status();
}
function field(label, path, type = "text", options = {}) {
  const value = get(path);
  const id = "f-" + path.replaceAll(".", "-");
  let input = "";
  if (type === "select")
    input = `<select id="${id}" data-path="${path}">${options.items
      .map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return `<option value="${esc(v)}" ${value === v ? "selected" : ""}>${esc(l)}</option>`;
      })
      .join("")}</select>`;
  else if (type === "textarea")
    input = `<textarea id="${id}" data-path="${path}" rows="${options.rows || 3}">${esc(value)}</textarea>`;
  else if (type === "color")
    input = `<div class="color-control"><input id="${id}" data-path="${path}" type="color" value="${esc(value)}"><code>${esc(value)}</code></div>`;
  else
    input = `<input id="${id}" data-path="${path}" type="${type}" value="${esc(value)}" ${options.min !== undefined ? `min="${options.min}"` : ""} ${options.max !== undefined ? `max="${options.max}"` : ""} ${options.step ? `step="${options.step}"` : ""} ${options.placeholder ? `placeholder="${esc(options.placeholder)}"` : ""}>`;
  return `<div class="field"><label for="${id}">${esc(label)}${type === "range" ? `<span class="label-value">${esc(value)}</span>` : ""}</label>${input}${options.hint ? `<small>${esc(options.hint)}</small>` : ""}</div>`;
}
function timeField(label, path, value, optional = false) {
  const id = "time-" + path.replaceAll(".", "-");
  return `<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" type="text" data-time-path="${path}" value="${value === null || value === undefined ? "" : formatTime(value, 3)}" placeholder="${optional ? "Leave blank for song end" : "0:00"}" aria-describedby="${id}-hint"><small id="${id}-hint">${optional ? "Optional. Example: 2:30 or 150 seconds." : "Example: 0:45, 1:15.5, or 75.5 seconds."}</small><small class="time-error" role="alert"></small></div>`;
}
function syncMusicTimes() {
  for (const input of document.querySelectorAll("[data-time-path]")) {
    const parsed = parseTime(input.value),
      value = input.dataset.timePath.endsWith(".start")
        ? (parsed ?? 0)
        : parsed;
    const keys = input.dataset.timePath.split(".");
    let target = config;
    for (const key of keys.slice(0, -1)) target = target[key];
    target[keys.at(-1)] = value;
  }
}
function toggle(label, path, hint = "") {
  const id = "f-" + path.replaceAll(".", "-");
  return `<div class="toggle-row"><label for="${id}">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ""}</label><input id="${id}" type="checkbox" data-path="${path}" ${get(path) ? "checked" : ""}></div>`;
}
function panel(title, description, content) {
  return `<section class="panel"><h2>${title}</h2><p class="panel-description">${description}</p>${content}</section>`;
}
function row(...fields) {
  return `<div class="field-row">${fields.join("")}</div>`;
}
function button(action, label, extra = "", style = "") {
  return `<button class="btn ${style}" data-action="${action}" ${extra}>${label}</button>`;
}
function picker(label, path, kind = "image") {
  const items = media.filter((m) => m.mime.startsWith(kind + "/"));
  return `<div class="field"><label for="pick-${path}">${label}</label><select class="media-picker plain-input" id="pick-${path}" data-path="${path}"><option value="">None</option>${items.map((m) => `<option value="/media/${m.id}" ${get(path) === "/media/" + m.id ? "selected" : ""}>${esc(m.name)} · ${esc(m.folder)}</option>`).join("")}</select>${items.length ? "" : "<small>Upload a file in Media library first.</small>"}</div>`;
}
function showTab(next) {
  tab = next;
  document
    .querySelectorAll(".tab")
    .forEach((el) => el.classList.toggle("active", el.dataset.tab === tab));
  document.querySelector(".sidebar")?.classList.remove("open");
  document.querySelector("#crumb").textContent = tabs.find(
    (t) => t[0] === tab,
  )[2];
  document.querySelector("#page-heading").innerHTML =
    `<h1 class="page-title">${titles[tab][0]}</h1><p class="page-intro">${titles[tab][1]}</p>`;
  document.querySelector("#controls").innerHTML = views[tab]();
  wireSpecial();
}
const views = {
  dashboard() {
    return `<div class="dashboard-hero"><img src="/floral.svg" alt=""><h2>A letter they will<br>keep in their heart.</h2><p>Your garden is ready to grow. Add your words, choose your flowers, and make a little magic.</p>${button("tab", "Make it personal ↗", 'data-target="letters"', "rose")}</div><div class="stats"><div class="stat"><small>YOUR LETTERS</small><strong>${config.letters.length}</strong></div><div class="stat"><small>MEMORIES</small><strong>${config.gallery.items.length}</strong></div><div class="stat"><small>CHAPTERS</small><strong>${config.sections.filter((s) => s.enabled).length}</strong></div></div>${panel(
      "A little finishing touch",
      "Good places to start making this space your own.",
      `<div class="quick-links">${[
        ["letters", "Write your love letter", "Words from the heart"],
        ["gallery", "Add your favorite photographs", "Moments worth keeping"],
        ["flowers", "Arrange your flowers", "A garden of your own"],
        ["music", "Choose your soundtrack", "A song that feels like you"],
      ]
        .map(
          ([id, label, note]) =>
            `<button class="quick-link" data-tab="${id}"><span>${label}<br><small>${note}</small></span><span>↗</span></button>`,
        )
        .join("")}</div>`,
    )}${panel("Publication & services", "Content updates go live immediately when you publish.", `<p class="notice">PUBLIC SITE · ${esc(meta.publicUrl)}<br>Last published: ${date(meta.publishedAt)}<br>Editor connected to the private API · ${meta.storage} media storage</p><p class="panel-description">Save draft keeps your work private. Publish updates the live site. The live preview on the right shows your current, unsaved changes.</p>`)}`;
  },
  letters() {
    const idx = Math.min(letterIndex, config.letters.length - 1);
    letterIndex = idx;
    const p = "letters." + idx,
      l = config.letters[idx];
    return (
      panel(
        "Your letters",
        "Create a collection of words to return to.",
        `<div class="field"><label for="letter-select">Currently editing</label><select id="letter-select" class="plain-input">${config.letters.map((x, i) => `<option value="${i}" ${i === idx ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select></div><div class="inline-actions">${button("new-letter", "+ New letter")}${config.letters.length > 1 ? button("delete-letter", "Remove letter", "", "danger") : ""}${button("active-letter", config.activeLetter === l.id ? "✓ Opening letter" : "Use as opening letter")}</div>`,
      ) +
      panel(
        "The welcome",
        "The first words they will see.",
        field("Small introduction", "welcome.eyebrow") +
          field("Opening headline", "welcome.title") +
          field("A little introduction", "welcome.subtitle", "textarea") +
          row(
            field("Recipient", "welcome.recipient"),
            field("From", "welcome.sender"),
          ) +
          row(
            field("Envelope button", "welcome.button"),
            field("Note below the envelope", "welcome.note"),
          ),
      ) +
      panel(
        "Write from the heart",
        "Select text to format it. Pasted content is cleaned for safety.",
        field("Letter title", p + ".title") +
          field("Greeting", p + ".greeting") +
          `<div class="field"><label id="body-label">Your letter</label><div class="rich-toolbar" role="toolbar" aria-label="Letter formatting"><button data-format="bold" aria-label="Bold"><b>B</b></button><button data-format="italic" aria-label="Italic"><i>I</i></button><button data-format="underline" aria-label="Underline"><u>U</u></button><button data-format="highlight" aria-label="Highlight selected text">Highlight</button><select id="block-format" aria-label="Paragraph style"><option value="p">Paragraph</option><option value="h2">Heading</option><option value="blockquote">Quotation</option></select><button data-format="removeFormat" aria-label="Clear formatting">Clear</button></div><div class="rich-editor" id="rich-body" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="body-label">${sanitizeRichText(l.body)}</div></div>` +
          field("Signature", p + ".signature") +
          field("Postscript", p + ".postscript", "textarea") +
          field("Writing animation", "writingAnimation", "select", {
            items: [
              ["none", "Show the complete letter"],
              ["typewriter", "Gentle typewriter reveal"],
            ],
          }),
      )
    );
  },
  theme() {
    const fonts = [
      "Cormorant Garamond",
      "Georgia",
      "Palatino",
      "Arial",
      "cursive",
    ];
    return (
      panel(
        "A palette for your story",
        "Start with a feeling, then make it yours.",
        `<div class="preset-grid">${[
          ["rose", "Rose garden", ["#fcf8f2", "#e8a1b3", "#a94361"]],
          ["peony", "Peony blush", ["#fff5f6", "#edb4c8", "#b75279"]],
          ["ivory", "Champagne", ["#faf7ef", "#d9bfa2", "#947052"]],
          ["dusk", "Rose at dusk", ["#2d242c", "#c5809a", "#f0aec4"]],
          ["lavender", "Lavender rose", ["#f8f3fc", "#c7a8d9", "#886098"]],
          ["white", "Porcelain", ["#ffffff", "#eecad3", "#a94361"]],
        ]
          .map(
            ([id, label, colors]) =>
              `<button class="preset" data-preset="${id}"><span class="preset-swatches">${colors.map((color) => `<i style="background:${color}"></i>`).join("")}</span>${label}</button>`,
          )
          .join("")}</div>`,
      ) +
      panel(
        "Flower-field video background",
        "A quiet, moving garden behind your transparent page. Video sound stays muted so your music remains separate.",
        toggle("Transparent page background", "theme.transparent") +
          toggle("Enable background video", "theme.video.enabled") +
          `<div class="upload-zone" id="video-upload-zone"><strong>A garden in motion.</strong><p>Upload an MP4 or WebM video up to 20 MB. It is stored privately in R2.</p><input id="video-upload" type="file" accept="video/mp4,video/webm" aria-label="Upload background video"></div><p class="upload-progress" id="video-upload-progress" role="status"></p>` +
          picker("Choose video", "theme.video.src", "video") +
          picker("Poster / still image", "theme.video.poster") +
          toggle("Autoplay (muted)", "theme.video.autoplay") +
          toggle("Loop video", "theme.video.loop") +
          toggle("Play on mobile", "theme.video.mobile") +
          toggle(
            "Use still image for reduced motion",
            "theme.video.reduceMotion",
          ) +
          row(
            field("Starting time, seconds", "theme.video.start", "number", {
              min: 0,
              max: 86400,
              step: 0.1,
            }),
            field("Playback speed", "theme.video.speed", "range", {
              min: 0.25,
              max: 2,
              step: 0.05,
            }),
          ) +
          field("Video visibility", "theme.video.opacity", "range", {
            min: 0,
            max: 1,
            step: 0.05,
          }) +
          field("Soft color overlay", "theme.video.overlay", "range", {
            min: 0,
            max: 1,
            step: 0.05,
            hint: "Lower values show more of the flower field; higher values make the words easier to read.",
          }) +
          field("Background blur", "theme.video.blur", "range", {
            min: 0,
            max: 20,
          }) +
          field(
            "Letter and photo paper opacity",
            "theme.video.paperOpacity",
            "range",
            { min: 0, max: 1, step: 0.05 },
          ) +
          row(
            field("Video sizing", "theme.video.fit", "select", {
              items: [
                ["cover", "Fill the screen"],
                ["contain", "Show the whole video"],
              ],
            }),
            field("Framing", "theme.video.position", "select", {
              items: ["center", "top", "bottom", "left", "right"],
            }),
          ) +
          button("clear-video", "Remove background video", "", "danger"),
      ) +
      panel(
        "Your colors",
        "Preview every change as you make it.",
        row(
          field("Page background", "theme.background", "color"),
          field("Letter paper", "theme.paper", "color"),
        ) +
          row(
            field("Rose accent", "theme.accent", "color"),
            field("Main text", "theme.text", "color"),
          ) +
          row(
            field("Secondary text", "theme.muted", "color"),
            field("Flower tint", "theme.flower", "color"),
          ) +
          field("Leaf tint", "theme.leaf", "color") +
          picker("Background image", "theme.backgroundImage") +
          toggle("Soft background gradient", "theme.gradient") +
          toggle("Paper texture", "theme.texture") +
          toggle("Dark appearance", "theme.dark"),
      ) +
      panel(
        "Typography",
        "Beautiful headings. Comfortable reading.",
        field("Heading font", "theme.headingFont", "select", { items: fonts }) +
          field("Body font", "theme.bodyFont", "select", { items: fonts }) +
          field("Letter font", "theme.letterFont", "select", { items: fonts }) +
          field("Letter font size", "theme.fontSize", "range", {
            min: 14,
            max: 30,
          }) +
          field("Welcome heading size", "theme.headingSize", "range", {
            min: 40,
            max: 120,
          }),
      ) +
      panel(
        "The details",
        "Space for the words to breathe.",
        field("Section spacing", "theme.spacing", "range", {
          min: 30,
          max: 180,
        }) +
          field("Letter width", "theme.letterWidth", "range", {
            min: 480,
            max: 1000,
          }) +
          row(
            field("Corner radius", "theme.radius", "range", {
              min: 0,
              max: 40,
            }),
            field("Paper shadow", "theme.shadow", "range", { min: 0, max: 60 }),
          ) +
          field("Border weight", "theme.border", "range", { min: 0, max: 4 }) +
          field("Button style", "theme.buttonStyle", "select", {
            items: [
              ["pill", "Soft & rounded"],
              ["square", "Classic & square"],
            ],
          }),
      )
    );
  },
  flowers() {
    return (
      panel(
        "The garden",
        "Small details, softly animated.",
        toggle("Show floral decorations", "effects.enabled") +
          field("Flower style", "effects.type", "select", {
            items: [
              ["peony", "Layered peonies"],
              ["rose", "Romantic roses"],
              ["cherry", "Cherry blossoms"],
            ],
          }) +
          field("Decoration position", "effects.positions", "select", {
            items: [
              ["corners", "Growing from the corners"],
              ["top", "Hanging garden"],
            ],
          }) +
          toggle("Gently swaying flowers", "effects.sway") +
          toggle("Blooming section reveals", "effects.bloom") +
          toggle("Hearts on secret notes", "effects.hearts"),
      ) +
      panel(
        "Falling petals",
        "Keep the moment light and lovely.",
        toggle("Falling petals", "effects.petals") +
          field("Petal quantity", "effects.quantity", "range", {
            min: 0,
            max: 40,
          }) +
          field("Flower & petal size", "effects.size", "range", {
            min: 8,
            max: 40,
          }) +
          field("Falling duration, seconds", "effects.speed", "range", {
            min: 5,
            max: 60,
            hint: "Higher values make petals fall more slowly.",
          }) +
          field("Animation intensity", "effects.intensity", "range", {
            min: 0,
            max: 1,
            step: 0.05,
          }) +
          field("Drift direction", "effects.direction", "select", {
            items: [
              ["right", "To the right"],
              ["left", "To the left"],
            ],
          }) +
          field("Performance mode", "settings.performance", "select", {
            items: [
              ["balanced", "Balanced"],
              ["gentle", "Gentle · up to 8 petals"],
            ],
          }) +
          '<p class="panel-description">Reduced-motion preferences are respected automatically.</p>',
      )
    );
  },
  music() {
    return (
      panel(
        "A soundtrack for two",
        "Upload several songs and give each one its own start and end times. Visitors can choose from the floating playlist.",
        toggle("Enable floating music player", "music.enabled") +
          `<div class="upload-zone" id="music-upload-zone"><strong>A playlist for your love story.</strong><p>Upload one or several songs. Each can play only the part you choose.</p><input id="music-upload" type="file" accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/x-wav" multiple aria-label="Upload songs to your playlist"></div><p class="upload-progress" id="music-upload-progress" role="status"></p>` +
          `<div class="field"><label for="active-song">Opening song</label><select id="active-song" data-path="music.active" class="plain-input"><option value="">First song in collection</option>${config.music.tracks.map((t) => `<option value="${esc(t.id)}" ${t.id === config.music.active ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>` +
          config.music.tracks
            .map(
              (t, i) =>
                `<div class="collection-item"><div class="item-heading"><strong>SONG ${i + 1}</strong><button data-remove="music.tracks" data-index="${i}">Remove</button></div>${field("Display name", `music.tracks.${i}.name`)}${picker("Audio file", `music.tracks.${i}.src`, "audio")}${row(timeField("Start playing at", `music.tracks.${i}.start`, t.start ?? config.music.start), timeField("Stop playing at", `music.tracks.${i}.end`, t.end ?? null, true))}<div class="inline-actions">${button("move-item", "↑", `data-array="music.tracks" data-index="${i}" data-step="-1"`)}${button("move-item", "↓", `data-array="music.tracks" data-index="${i}" data-step="1"`)}</div>${t.src ? `<audio controls preload="metadata" src="${esc(t.src)}"></audio>` : ""}</div>`,
            )
            .join("") +
          button("add-song", "+ Add song"),
      ) +
      panel(
        "Playback settings",
        "Browsers may require a tap before playing audio.",
        field("Default start for new songs, seconds", "music.start", "number", {
          min: 0,
          max: 86400,
          step: 0.1,
          hint: "Each song has its own start and end fields above. This default is used when you add a new song.",
        }) +
          field("Volume", "music.volume", "range", {
            min: 0,
            max: 1,
            step: 0.01,
          }) +
          toggle(
            "Loop the selected excerpt",
            "music.loop",
            "Repeat the chosen start–end range.",
          ) +
          toggle(
            "Continue with the next song",
            "music.autoAdvance",
            "When looping is off, play the next song after the selected excerpt.",
          ) +
          field("Start music", "music.mode", "select", {
            items: [
              ["interaction", "When the envelope opens"],
              ["entry", "Request autoplay on entry"],
            ],
          }) +
          field("Player appearance", "music.design", "select", {
            items: [
              ["pill", "Floating pill"],
              ["square", "Classic rectangle"],
            ],
          }),
      )
    );
  },
  gallery() {
    return panel(
      "Our moments",
      "A personal scrapbook, one photograph at a time.",
      `<div class="upload-zone" id="gallery-upload-zone"><strong>Add photos to your love letter.</strong><p>Choose several photos or drop them here. Add captions below, then Publish to show them on your main site.</p><input id="gallery-upload" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple aria-label="Upload photos to the main website"><p>Photos are optimized and saved in your R2 media library.</p></div><p class="upload-progress" id="gallery-upload-progress" role="status"></p><div class="inline-actions">${button("tab", "Choose from media library", 'data-target="media"')}</div>` +
        field("Gallery heading", "gallery.title") +
        field("Introduction", "gallery.subtitle", "textarea") +
        field("Photo frames", "gallery.style", "select", {
          items: [
            ["polaroid", "Romantic polaroids"],
            ["clean", "Clean editorial"],
          ],
        }) +
        toggle("Gentle slideshow spotlight", "gallery.slideshow") +
        field("Slideshow interval, seconds", "gallery.interval", "number", {
          min: 2,
          max: 60,
        }) +
        config.gallery.items
          .map(
            (p, i) =>
              `<div class="collection-item"><div class="item-heading"><strong>MEMORY ${i + 1}</strong><button data-remove="gallery.items" data-index="${i}">Remove</button></div>${p.src ? `<img class="asset-thumb" src="${esc(p.src)}" alt="${esc(p.caption)}">` : ""}${picker("Photograph", `gallery.items.${i}.src`)}${field("Caption", `gallery.items.${i}.caption`)}${field("Date or a little note", `gallery.items.${i}.date`)}<div class="inline-actions">${button("move-item", "↑", 'data-array="gallery.items" data-index="' + i + '" data-step="-1"')}${button("move-item", "↓", 'data-array="gallery.items" data-index="' + i + '" data-step="1"')}</div></div>`,
          )
          .join("") +
        button("add-photo", "+ Add a memory"),
    );
  },
  timeline() {
    return panel(
      "Our story",
      "The beginnings, the milestones, and all the in-between.",
      field("Timeline heading", "timeline.title") +
        config.timeline.items
          .map(
            (m, i) =>
              `<div class="collection-item"><div class="item-heading"><strong>CHAPTER ${i + 1}</strong><button data-remove="timeline.items" data-index="${i}">Remove</button></div>${field("Date or chapter label", `timeline.items.${i}.date`)}${field("Title", `timeline.items.${i}.title`)}${field("The memory", `timeline.items.${i}.description`, "textarea")}<div class="inline-actions">${button("move-item", "↑", `data-array="timeline.items" data-index="${i}" data-step="-1"`)}${button("move-item", "↓", `data-array="timeline.items" data-index="${i}" data-step="1"`)}</div></div>`,
          )
          .join("") +
        button("add-moment", "+ Add a chapter"),
    );
  },
  surprises() {
    return panel(
      "A little something to discover",
      "Notes unfold with a tap. Only the label is visible at first.",
      field("Section heading", "surprises.title") +
        field("Introduction", "surprises.subtitle", "textarea") +
        config.surprises.items
          .map(
            (m, i) =>
              `<div class="collection-item"><div class="item-heading"><strong>NOTE ${i + 1}</strong><button data-remove="surprises.items" data-index="${i}">Remove</button></div>${field("Note label", `surprises.items.${i}.label`)}${field("Your secret message", `surprises.items.${i}.message`, "textarea")}</div>`,
          )
          .join("") +
        button("add-note", "+ Add a secret note"),
    );
  },
  layout() {
    return panel(
      "The flow of your story",
      "Drag chapters to rearrange them, or use the arrow buttons. Hide a chapter without losing its content.",
      config.sections
        .map(
          (s, i) =>
            `<div class="section-row" draggable="true" data-section="${i}"><span aria-hidden="true">⠿</span><strong>${esc(s.type)}</strong><label><input type="checkbox" aria-label="Show ${esc(s.type)}" data-path="sections.${i}.enabled" ${s.enabled ? "checked" : ""}></label><div class="row-controls"><button data-action="move-section" data-index="${i}" data-step="-1" aria-label="Move chapter up">↑</button><button data-action="move-section" data-index="${i}" data-step="1" aria-label="Move chapter down">↓</button><button data-remove="sections" data-index="${i}" aria-label="Remove chapter">×</button></div></div><details class="section-options"><summary style="font-size:9px;color:#ac8396;padding-top:10px;cursor:pointer">Chapter appearance</summary>${row(field("Alignment", `sections.${i}.align`, "select", { items: ["center", "left", "right"] }), field("Spacing", `sections.${i}.spacing`, "range", { min: 20, max: 180 }))}${field("Section background", `sections.${i}.background`, "color")}${button("clear-bg", "Use page background", `data-index="${i}"`, "small")}${row(
              field("Reveal", `sections.${i}.animation`, "select", {
                items: [
                  ["rise", "Gentle rise"],
                  ["bloom", "Soft bloom"],
                  ["none", "No animation"],
                ],
              }),
              field("Desktop width", `sections.${i}.desktop`, "select", {
                items: [
                  ["wide", "Wide"],
                  ["narrow", "Narrow"],
                ],
              }),
            )}${field(
              "Mobile gallery layout",
              `sections.${i}.mobile`,
              "select",
              {
                items: [
                  ["stack", "Two photos per row"],
                  ["single", "One photo per row"],
                ],
              },
            )}${s.type === "quote" ? field("Quotation", `sections.${i}.text`, "textarea") : ""}</details>`,
        )
        .join("") +
        `<div class="field"><label for="new-section">Add a chapter</label><select id="new-section" class="plain-input">${["letter", "gallery", "timeline", "surprises", "quote"].map((s) => `<option>${s}</option>`).join("")}</select></div>` +
        button("add-section", "+ Add chapter"),
    );
  },
  media() {
    const total = media.reduce((n, m) => n + m.size, 0);
    return panel(
      "Your media library",
      `Storage: ${meta.storage}. ${size(total)} used. ${meta.storage === "D1" ? "64 MB total allowance; 8 MB per audio file, 3 MB per image." : "20 MB per file; images up to 3 MB."}`,
      `<div class="field"><label for="upload-folder">Upload folder</label><input id="upload-folder" class="plain-input" value="Memories" maxlength="80"></div><div class="upload-zone"><strong>A little treasure to keep.</strong><p>Drop your photographs, videos, or songs, or choose files below.</p><input id="upload" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/ogg,audio/wav" multiple aria-label="Upload media"><p>Photos are resized to 1800 pixels and optimized locally before upload.</p></div><p class="upload-progress" role="status" id="upload-progress"></p><div class="field"><label for="media-filter">Find in your collection</label><input id="media-filter" placeholder="Search filename or folder…"></div><div class="media-grid">${media.map((m) => `<article class="media-item" data-search="${esc((m.name + " " + m.folder).toLowerCase())}">${m.mime.startsWith("image/") ? `<img src="/media/${m.id}" loading="lazy" alt="${esc(m.name)}">` : m.mime.startsWith("video/") ? `<video controls playsinline preload="metadata" src="/media/${m.id}" aria-label="${esc(m.name)}"></video>` : '<div class="audio-preview" aria-hidden="true">♫</div>'}<div class="media-info"><strong>${esc(m.name)}</strong><small>${esc(m.folder)} · ${size(m.size)}</small><div class="media-actions">${m.mime.startsWith("image/") ? button("use-photo", "Add to gallery", `data-id="${m.id}"`) : m.mime.startsWith("video/") ? button("use-video", "Use as background", `data-id="${m.id}"`) : button("use-song", "Add to music", `data-id="${m.id}"`)}${button("rename-media", "Organize", `data-id="${m.id}"`)}${button("replace-media", "Replace", `data-id="${m.id}"`)}${button("delete-media", "Delete", `data-id="${m.id}"`, "danger")}</div></div></article>`).join("")}</div>${media.length ? "" : '<p class="empty">Your collection is waiting for its first little treasure.</p>'}<input type="file" id="replace-upload" hidden accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/ogg,audio/wav">`,
    );
  },
  settings() {
    return (
      panel(
        "Website details",
        "Make the first impression a personal one.",
        field("Browser title", "settings.title") +
          field(
            "Search & sharing description",
            "settings.description",
            "textarea",
          ) +
          picker("Favicon image", "settings.favicon") +
          picker("Social sharing image", "settings.socialImage") +
          field("Closing words", "settings.footer"),
      ) +
      panel(
        "A quiet moment",
        "Maintenance is applied when you publish.",
        toggle("Maintenance mode", "settings.maintenance") +
          field(
            "Maintenance message",
            "settings.maintenanceMessage",
            "textarea",
          ),
      ) +
      panel(
        "A key to your garden",
        `Visitor password: ${meta.gateEnabled ? "enabled" : "disabled"}. Security changes take effect immediately.`,
        '<div class="field"><label for="gate-password">New visitor password (at least 8 characters)</label><input id="gate-password" type="password" autocomplete="new-password" class="plain-input" minlength="8"></div><div class="inline-actions">' +
          button("set-gate", "Set visitor password") +
          button("remove-gate", "Remove visitor password", "", "danger") +
          "</div>",
      ) +
      panel(
        "Your private studio",
        "Changing the editor password signs out other editor sessions.",
        '<div class="field"><label for="current-password">Current editor password</label><input id="current-password" class="plain-input" type="password" autocomplete="current-password"></div><div class="field"><label for="new-password">New editor password (14+ characters)</label><input id="new-password" class="plain-input" type="password" autocomplete="new-password" minlength="14"></div>' +
          button("change-password", "Change editor password"),
      ) +
      panel(
        "Keep a copy",
        "Backups contain content and configuration. Media files and passwords are not included. Restore into this same project to retain media references.",
        `<div class="inline-actions">${button("backup", "Download configuration")}<label class="btn" for="restore" style="margin:0;cursor:pointer">Restore configuration</label><input id="restore" hidden type="file" accept="application/json"></div>`,
      ) +
      panel(
        "A fresh beginning",
        "Reset creates an unsaved default draft. Your published site and version history stay available.",
        button("reset", "Reset draft to the original garden", "", "danger"),
      )
    );
  },
  history() {
    return panel(
      "Your published versions",
      "Restore loads the content into your private draft. Publish it to make the earlier design live again.",
      versions.length
        ? versions
            .map(
              (v) =>
                `<div class="version"><div><strong>${esc(v.label)}</strong><time>${date(v.created_at)}</time></div><div class="inline-actions">${button("revert", "Restore draft", `data-id="${v.id}"`)}${button("delete-version", "Delete archive", `data-id="${v.id}"`, "danger small")}</div></div>`,
            )
            .join("")
        : '<p class="empty">Your first published chapter will appear here.</p>',
    );
  },
};
const presets = {
  rose: {
    background: "#fcf8f2",
    paper: "#fffdf8",
    accent: "#a94361",
    text: "#593d46",
    muted: "#806a71",
    flower: "#e8a1b3",
    leaf: "#84957b",
    dark: false,
  },
  peony: {
    background: "#fff5f6",
    paper: "#fffcfc",
    accent: "#b75279",
    text: "#613a4b",
    muted: "#926c7c",
    flower: "#edb4c8",
    leaf: "#9aab8d",
    dark: false,
  },
  ivory: {
    background: "#faf7ef",
    paper: "#fffdf7",
    accent: "#947052",
    text: "#57483d",
    muted: "#827567",
    flower: "#d9bfa2",
    leaf: "#8d997a",
    dark: false,
  },
  dusk: {
    background: "#2d242c",
    paper: "#382c35",
    accent: "#f0aec4",
    text: "#f5e4e9",
    muted: "#c4a7b6",
    flower: "#c5809a",
    leaf: "#879080",
    dark: true,
  },
  lavender: {
    background: "#f8f3fc",
    paper: "#fffaff",
    accent: "#886098",
    text: "#57405f",
    muted: "#8f7899",
    flower: "#c7a8d9",
    leaf: "#8b9e8a",
    dark: false,
  },
  white: {
    background: "#ffffff",
    paper: "#ffffff",
    accent: "#a94361",
    text: "#503941",
    muted: "#86707a",
    flower: "#eecad3",
    leaf: "#96a48c",
    dark: false,
  },
};
function date(v) {
  return new Date(v).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
function size(v) {
  return v < 1048576
    ? (v / 1024).toFixed(1) + " KB"
    : (v / 1048576).toFixed(1) + " MB";
}
function wireSpecial() {
  const rich = document.querySelector("#rich-body");
  if (rich) {
    rich.addEventListener("input", () =>
      set(`letters.${letterIndex}.body`, rich.innerHTML),
    );
    rich.addEventListener("paste", (e) => {
      e.preventDefault();
      const text =
        e.clipboardData.getData("text/html") ||
        esc(e.clipboardData.getData("text/plain")).replaceAll("\n", "<br>");
      document.execCommand("insertHTML", false, sanitizeRichText(text));
      set(`letters.${letterIndex}.body`, rich.innerHTML);
    });
    document.querySelectorAll("[data-format]").forEach((b) => {
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => {
        rich.focus();
        if (b.dataset.format === "highlight") {
          const selection = window.getSelection();
          if (selection.rangeCount && rich.contains(selection.anchorNode)) {
            const range = selection.getRangeAt(0),
              mark = document.createElement("mark");
            mark.append(range.extractContents());
            range.insertNode(mark);
          }
        } else document.execCommand(b.dataset.format);
        set(`letters.${letterIndex}.body`, rich.innerHTML);
      });
    });
    document.querySelector("#block-format").onchange = (e) => {
      rich.focus();
      document.execCommand("formatBlock", false, e.target.value);
      set(`letters.${letterIndex}.body`, rich.innerHTML);
    };
  }
  document.querySelector("#letter-select")?.addEventListener("change", (e) => {
    letterIndex = Number(e.target.value);
    showTab("letters");
  });
  document.querySelector("#media-filter")?.addEventListener("input", (e) => {
    document
      .querySelectorAll(".media-item")
      .forEach(
        (m) =>
          (m.hidden = !m.dataset.search.includes(e.target.value.toLowerCase())),
      );
  });
  document
    .querySelector("#video-upload")
    ?.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const progress = document.querySelector("#video-upload-progress");
      event.target.disabled = true;
      try {
        progress.textContent = "Uploading your garden to R2…";
        if (!["video/mp4", "video/webm"].includes(file.type))
          throw Error("Choose an MP4 or WebM video.");
        const uploaded = await uploadOne(file, "Backgrounds");
        config.theme.video.src = uploaded.src;
        config.theme.video.enabled = true;
        config.theme.transparent = true;
        changed();
        media = await api("/api/admin/media");
        showTab("theme");
        toast("Video added to your draft. Adjust the overlay, then Publish.");
      } catch (error) {
        progress.textContent = error.message;
        event.target.disabled = false;
      }
    });
  document
    .querySelector("#music-upload")
    ?.addEventListener("change", async (event) => {
      const input = event.target;
      const files = [...input.files];
      if (!files.length) return;
      input.disabled = true;
      const progress = document.querySelector("#music-upload-progress"),
        errors = [];
      let count = 0;
      for (const file of files) {
        try {
          if (!file.type.startsWith("audio/"))
            throw Error("Choose an audio file.");
          if (config.music.tracks.length >= 100)
            throw Error("Keep your playlist below 100 songs.");
          progress.textContent = "Uploading " + file.name + "…";
          const uploaded = await uploadOne(file, "Music");
          config.music.tracks.push({
            id: crypto.randomUUID(),
            name: file.name.replace(/\.[^.]+$/, ""),
            src: uploaded.src,
            start: config.music.start || 0,
            end: null,
          });
          config.music.enabled = true;
          changed();
          count++;
        } catch (error) {
          errors.push(file.name + ": " + error.message);
        }
      }
      try {
        media = await api("/api/admin/media");
      } catch (error) {
        errors.push(error.message);
      }
      input.disabled = false;
      showTab("music");
      toast(
        count +
          " song(s) added. Set each start and end time, then Publish." +
          (errors.length ? " " + errors.join(" ") : ""),
      );
    });
  document.querySelectorAll("[data-time-path]").forEach((input) =>
    input.addEventListener("input", () => {
      try {
        const seconds = parseTime(input.value);
        set(
          input.dataset.timePath,
          input.dataset.timePath.endsWith(".start") ? (seconds ?? 0) : seconds,
        );
        input.removeAttribute("aria-invalid");
        input.closest(".field").querySelector(".time-error").textContent = "";
      } catch (error) {
        input.setAttribute("aria-invalid", "true");
        input.closest(".field").querySelector(".time-error").textContent =
          error.message;
      }
    }),
  );
  const upload = document.querySelector("#upload");
  upload?.addEventListener("change", (e) => uploads([...e.target.files]));
  document
    .querySelector("#gallery-upload")
    ?.addEventListener("change", (e) =>
      uploads([...e.target.files], { gallery: true }),
    );
  const zone = document.querySelector(
    ".upload-zone:not(#video-upload-zone):not(#music-upload-zone)",
  );
  zone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.style.background = "#f2dfe6";
  });
  zone?.addEventListener("dragleave", () => (zone.style.background = ""));
  zone?.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.style.background = "";
    uploads([...e.dataTransfer.files], {
      gallery: zone.id === "gallery-upload-zone",
    });
  });
  document.querySelector("#restore")?.addEventListener("change", async (e) => {
    try {
      const file = e.target.files[0];
      if (file.size > 240000)
        throw Error("Configuration backup exceeds 240 KB.");
      const parsed = JSON.parse(await file.text()),
        value = validateConfig(parsed.config || parsed);
      if (
        !confirm(
          "Replace your current draft with this backup? Your live website will stay as it is.",
        )
      )
        return;
      config = value;
      changed();
      showTab("settings");
      sendPreview();
      toast(
        "Backup loaded into your unsaved draft. Preview it before publishing.",
      );
    } catch (err) {
      toast(err.message);
    }
  });
  let source;
  document.querySelectorAll("[data-section]").forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      if (e.target.closest("button,input,select")) {
        e.preventDefault();
        return;
      }
      source = Number(row.dataset.section);
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () =>
      document
        .querySelectorAll(".section-row")
        .forEach((el) => el.classList.remove("dragging", "drag-over")),
    );
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      if (source === undefined) return;
      const [item] = config.sections.splice(source, 1);
      config.sections.splice(Number(row.dataset.section), 0, item);
      source = undefined;
      changed();
      showTab("layout");
    });
  });
}
document.addEventListener("input", (event) => {
  const el = event.target;
  if (!el.dataset.path || !config) return;
  const value =
    el.type === "checkbox"
      ? el.checked
      : ["range", "number"].includes(el.type)
        ? Number(el.value)
        : el.value;
  set(el.dataset.path, value);
  if (el.type === "color") el.nextElementSibling.textContent = value;
  if (el.type === "range")
    el.closest(".field").querySelector(".label-value").textContent = value;
});
document.addEventListener("change", (event) => {
  const el = event.target;
  if (el.dataset.path && el.tagName === "SELECT")
    set(el.dataset.path, el.value);
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "s" && config) {
    event.preventDefault();
    save()
      .then(() => toast("Your draft is safely saved."))
      .catch((e) => toast(e.message));
  }
});
window.addEventListener("beforeunload", (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
document.addEventListener("click", async (event) => {
  const target = event.target.closest("button,a");
  if (!target || !config) return;
  try {
    if (target.dataset.tab) {
      showTab(target.dataset.tab);
      return;
    }
    if (target.dataset.device) {
      document
        .querySelector(".preview-frame-wrap")
        .classList.toggle("mobile", target.dataset.device === "mobile");
      document
        .querySelectorAll("[data-device]")
        .forEach((b) => b.classList.toggle("active", b === target));
      return;
    }
    if (target.dataset.preset) {
      Object.assign(config.theme, presets[target.dataset.preset], {
        preset: target.dataset.preset,
      });
      changed();
      showTab("theme");
      return;
    }
    if (target.dataset.remove) {
      const arr = get(target.dataset.remove),
        index = Number(target.dataset.index);
      if (
        target.dataset.remove === "sections" &&
        !confirm(
          "Remove this chapter from the layout? Its content remains available to add again.",
        )
      )
        return;
      arr.splice(index, 1);
      changed();
      showTab(tab);
      return;
    }
    const action = target.dataset.action;
    if (!action) return;
    if (action === "tab") {
      showTab(target.dataset.target);
      return;
    }
    if (action === "menu") {
      document.querySelector(".sidebar").classList.toggle("open");
      return;
    }
    if (action === "save") {
      target.disabled = true;
      try {
        await save();
        toast("Your draft is safely saved.");
      } finally {
        target.disabled = false;
      }
      return;
    }
    if (action === "publish") {
      await publish();
      return;
    }
    if (action === "logout") {
      if (
        dirty &&
        !confirm("You have unsaved changes. Sign out without saving?")
      )
        return;
      await api("/api/auth/logout", { method: "POST", body: {} });
      config = null;
      dirty = false;
      login(false);
      return;
    }
    if (action === "clear-video") {
      config.theme.video.src = "";
      config.theme.video.enabled = false;
      changed();
      showTab("theme");
      return;
    }
    if (action === "use-video") {
      config.theme.video.src = "/media/" + target.dataset.id;
      config.theme.video.enabled = true;
      config.theme.transparent = true;
      changed();
      showTab("theme");
      return;
    }
    if (action === "new-letter") {
      const l = {
        ...cloneDefaults().letters[0],
        id: crypto.randomUUID(),
        title: "Another little love letter",
        body: "<p>There is something I have been meaning to tell you…</p>",
      };
      config.letters.push(l);
      letterIndex = config.letters.length - 1;
    }
    if (action === "delete-letter") {
      if (!confirm("Remove this letter from your draft?")) return;
      const [l] = config.letters.splice(letterIndex, 1);
      if (config.activeLetter === l.id)
        config.activeLetter = config.letters[0].id;
      letterIndex = 0;
    }
    if (action === "active-letter")
      config.activeLetter = config.letters[letterIndex].id;
    if (action === "add-song")
      config.music.tracks.push({
        id: crypto.randomUUID(),
        name: "Our song",
        src: "",
        start: config.music.start || 0,
        end: null,
      });
    if (action === "add-photo")
      config.gallery.items.push({
        id: crypto.randomUUID(),
        src: "",
        caption: "A moment worth keeping",
        date: "",
      });
    if (action === "add-moment")
      config.timeline.items.push({
        id: crypto.randomUUID(),
        date: "A special day",
        title: "Another beautiful chapter",
        description: "A moment I never want to forget.",
      });
    if (action === "add-note")
      config.surprises.items.push({
        id: crypto.randomUUID(),
        label: "A little secret",
        message: "Just in case you forgot — you are loved.",
      });
    if (action === "add-section") {
      const type = document.querySelector("#new-section").value;
      config.sections.push({
        id: crypto.randomUUID(),
        type,
        enabled: true,
        align: "center",
        spacing: 100,
        background: "",
        animation: "rise",
        desktop: "wide",
        mobile: "stack",
      });
    }
    if (action === "clear-bg")
      config.sections[Number(target.dataset.index)].background = "";
    if (action === "move-section" || action === "move-item") {
      const arr =
          action === "move-section"
            ? config.sections
            : get(target.dataset.array),
        index = Number(target.dataset.index),
        to = index + Number(target.dataset.step);
      if (to < 0 || to >= arr.length) return;
      const [item] = arr.splice(index, 1);
      arr.splice(to, 0, item);
    }
    if (action === "use-photo") {
      const m = media.find((x) => x.id === target.dataset.id);
      config.gallery.items.push({
        id: crypto.randomUUID(),
        src: "/media/" + m.id,
        caption: m.name.replace(/\.[^.]+$/, ""),
        date: "",
      });
      toast("Added to the gallery in your draft.");
    }
    if (action === "use-song") {
      const m = media.find((x) => x.id === target.dataset.id);
      config.music.tracks.push({
        id: crypto.randomUUID(),
        src: "/media/" + m.id,
        name: m.name.replace(/\.[^.]+$/, ""),
        start: config.music.start || 0,
        end: null,
      });
      config.music.enabled = true;
      toast("Added to your music collection.");
    }
    if (action === "rename-media") {
      const m = media.find((x) => x.id === target.dataset.id),
        name = prompt("Media display name", m.name);
      if (name === null) return;
      const folder = prompt("Folder", m.folder);
      if (folder === null) return;
      await api("/api/admin/media/" + m.id, {
        method: "PATCH",
        body: { name, folder },
      });
      media = await api("/api/admin/media");
      showTab("media");
      return;
    }
    if (action === "delete-media") {
      if (
        !confirm(
          "Permanently delete this unused upload? Media used by any saved publication is protected.",
        )
      )
        return;
      await api("/api/admin/media/" + target.dataset.id, { method: "DELETE" });
      media = await api("/api/admin/media");
      showTab("media");
      toast("Unused media deleted.");
      return;
    }
    if (action === "replace-media") {
      const old = media.find((x) => x.id === target.dataset.id),
        input = document.querySelector("#replace-upload");
      input.onchange = async () => {
        try {
          const file = input.files[0];
          if (!file) return;
          if (file.type.split("/")[0] !== old.mime.split("/")[0])
            throw Error("Choose the same kind of media.");
          const m = await uploadOne(file, old.folder),
            before = "/media/" + old.id,
            after = "/media/" + m.id;
          config = JSON.parse(JSON.stringify(config).split(before).join(after));
          media = await api("/api/admin/media");
          changed();
          showTab("media");
          sendPreview();
          toast(
            "Replaced throughout your draft. Published versions keep their original asset.",
          );
        } catch (e) {
          toast(e.message);
        }
      };
      input.click();
      return;
    }
    if (action === "set-gate" || action === "remove-gate") {
      const password =
        action === "set-gate"
          ? document.querySelector("#gate-password").value
          : "";
      if (action === "set-gate" && password.length < 8)
        throw Error("Use at least 8 characters.");
      if (
        action === "remove-gate" &&
        !confirm("Remove the visitor password immediately?")
      )
        return;
      await api("/api/admin/security", {
        method: "PUT",
        body: { gatePassword: password },
      });
      meta.gateEnabled = !!password;
      showTab("settings");
      toast(
        password
          ? "Visitor password is now active."
          : "Visitor password removed.",
      );
      return;
    }
    if (action === "change-password") {
      await api("/api/admin/security", {
        method: "PUT",
        body: {
          currentPassword: document.querySelector("#current-password").value,
          newPassword: document.querySelector("#new-password").value,
        },
      });
      showTab("settings");
      toast(
        "Editor password changed. Other editor sessions have been signed out.",
      );
      return;
    }
    if (action === "backup") {
      const blob = new Blob(
          [
            JSON.stringify(
              { exportedAt: new Date().toISOString(), config },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download =
        "loveletta-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    if (action === "reset") {
      if (
        !confirm(
          "Reset your draft to the original design? You can restore your published versions from history.",
        )
      )
        return;
      config = cloneDefaults();
      letterIndex = 0;
    }
    if (action === "delete-version") {
      if (
        !confirm(
          "Permanently delete this archived publication? Its media may become eligible for deletion when no remaining draft or publication uses it.",
        )
      )
        return;
      await api("/api/admin/versions/" + target.dataset.id, {
        method: "DELETE",
      });
      versions = await api("/api/admin/versions");
      showTab("history");
      toast("Archived publication deleted.");
      return;
    }
    if (action === "revert") {
      if (
        !confirm(
          "Load this publication into your draft? Your current draft will be replaced. The public site changes only when you publish.",
        )
      )
        return;
      const result = await api("/api/admin/revert", {
        method: "POST",
        body: { id: target.dataset.id, revision },
      });
      config = result.config;
      revision = result.revision;
      dirty = false;
      status();
      sendPreview();
      toast(
        "Earlier version restored as a saved draft. Preview it, then publish.",
      );
      return;
    }
    changed();
    showTab(tab);
  } catch (e) {
    toast(e.message);
  }
});
async function optimize(file) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.87),
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", {
    type: "image/webp",
  });
}
async function uploadOne(file, folder) {
  const optimized = await optimize(file);
  const max = meta.storage === "R2" ? 20 : 8;
  if (optimized.size > max * 1024 * 1024)
    throw Error(`Keep uploads below ${max} MB.`);
  if (optimized.type.startsWith("image/") && optimized.size > 3 * 1024 * 1024)
    throw Error("Keep images below 3 MB.");
  return api("/api/admin/media", {
    method: "POST",
    body: optimized,
    headers: {
      "Content-Type": optimized.type,
      "X-File-Name": encodeURIComponent(optimized.name),
      "X-Folder": encodeURIComponent(folder),
    },
  });
}
function ensureGallerySection() {
  const section = config.sections.find((item) => item.type === "gallery");
  if (section) section.enabled = true;
  else {
    const section = cloneDefaults().sections.find(
      (item) => item.type === "gallery",
    );
    config.sections.push({ ...section, id: crypto.randomUUID() });
  }
}
async function uploads(files, { gallery = false } = {}) {
  if (!files.length) return;
  if (
    gallery &&
    !config.sections.some((item) => item.type === "gallery") &&
    config.sections.length >= 20
  ) {
    toast(
      "Remove a chapter in Page layout to make room for your photo gallery.",
    );
    return;
  }
  const progress = document.querySelector(
      gallery ? "#gallery-upload-progress" : "#upload-progress",
    ),
    input = document.querySelector(gallery ? "#gallery-upload" : "#upload"),
    folder = gallery
      ? "Memories"
      : document.querySelector("#upload-folder")?.value || "General";
  const errors = [];
  let complete = 0;
  input.disabled = true;
  for (const file of files) {
    try {
      if (gallery && !file.type.startsWith("image/"))
        throw Error("Choose a photo for your gallery.");
      if (gallery && config.gallery.items.length >= 100)
        throw Error("Your gallery can hold up to 100 photos.");
      progress.textContent = `Optimizing & uploading ${complete + 1} of ${files.length}: ${file.name}`;
      const uploaded = await uploadOne(file, folder);
      if (gallery) {
        config.gallery.items.push({
          id: crypto.randomUUID(),
          src: uploaded.src,
          caption: file.name.replace(/\.[^.]+$/, ""),
          date: "",
        });
        ensureGallerySection();
        changed();
      }
      complete++;
    } catch (e) {
      errors.push(file.name + ": " + e.message);
    }
  }
  try {
    media = await api("/api/admin/media");
  } catch (error) {
    errors.push(error.message);
  } finally {
    input.disabled = false;
  }
  showTab(gallery ? "gallery" : "media");
  toast(
    `${complete} photo${complete === 1 ? "" : "s"}${gallery ? " added to your draft gallery. Publish to show them on your main site." : " / file(s) added to your collection."}${errors.length ? " " + errors.join(" ") : ""}`,
  );
}
init();
