export const videoDefaults = {
  enabled: false,
  src: "",
  poster: "",
  autoplay: true,
  loop: true,
  start: 0,
  speed: 0.8,
  opacity: 0.85,
  overlay: 0.64,
  blur: 0,
  fit: "cover",
  position: "center",
  mobile: true,
  reduceMotion: true,
  paperOpacity: 0.85,
};
const tags = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "h2",
  "h3",
  "blockquote",
  "mark",
  "ul",
  "ol",
  "li",
]);
export function sanitizeRichText(value) {
  return String(value).replace(
    /<!--[\s\S]*?-->|<\/?([a-z][a-z0-9]*)\b[^>]*>|[<>]/gi,
    (raw, tag) => {
      if (tag)
        return tags.has(tag.toLowerCase())
          ? `<${raw.startsWith("</") ? "/" : ""}${tag.toLowerCase()}>`
          : "";
      return raw === "<" ? "&lt;" : raw === ">" ? "&gt;" : "";
    },
  );
}
export function validateConfig(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    input.schemaVersion !== 1
  )
    throw new Error("Unsupported backup or configuration version.");
  const serialized = JSON.stringify(input);
  if (serialized.length > 240000)
    throw new Error("Content is too large. Keep backups below 240 KB.");
  const c = JSON.parse(serialized);
  if (c.theme && typeof c.theme === "object")
    c.theme.video = { ...videoDefaults, ...c.theme.video };
  for (const key of [
    "welcome",
    "theme",
    "effects",
    "music",
    "gallery",
    "timeline",
    "surprises",
    "settings",
  ])
    if (!c[key] || typeof c[key] !== "object" || Array.isArray(c[key]))
      throw new Error(`Missing ${key}.`);
  for (const key of ["letters", "sections"])
    if (!Array.isArray(c[key])) throw new Error(`Missing ${key}.`);
  if (!c.letters.length || c.letters.length > 30 || c.sections.length > 20)
    throw new Error("Use 1–30 letters and up to 20 sections.");
  for (const l of c.letters) {
    if (
      !l ||
      typeof l !== "object" ||
      typeof l.body !== "string" ||
      l.body.length > 60000
    )
      throw new Error("Invalid letter body.");
    l.body = sanitizeRichText(l.body);
  }
  if (!c.letters.some((l) => l.id === c.activeLetter))
    throw new Error("Select an existing active letter.");
  if (
    !Array.isArray(c.gallery.items) ||
    !Array.isArray(c.timeline.items) ||
    !Array.isArray(c.surprises.items) ||
    !Array.isArray(c.music.tracks)
  )
    throw new Error("Invalid collection.");
  if (
    [c.gallery.items, c.timeline.items, c.surprises.items, c.music.tracks].some(
      (a) => a.length > 100,
    )
  )
    throw new Error("Use no more than 100 items per collection.");
  for (const list of [
    c.gallery.items,
    c.timeline.items,
    c.surprises.items,
    c.music.tracks,
    c.sections,
  ])
    if (list.some((x) => !x || typeof x !== "object" || Array.isArray(x)))
      throw new Error("Invalid collection item.");
  const allowedSections = [
    "letter",
    "gallery",
    "timeline",
    "surprises",
    "quote",
  ];
  if (
    c.sections.some((s) => !allowedSections.includes(s.type)) ||
    new Set(c.sections.map((s) => s.id)).size !== c.sections.length
  )
    throw new Error("Invalid or duplicate section.");
  for (const key of [
    "background",
    "paper",
    "accent",
    "text",
    "muted",
    "flower",
    "leaf",
  ])
    if (!/^#[\da-f]{6}$/i.test(c.theme[key]))
      throw new Error(`Invalid ${key} color.`);
  for (const key of ["headingFont", "bodyFont", "letterFont"])
    if (
      ![
        "Cormorant Garamond",
        "Georgia",
        "Palatino",
        "Arial",
        "cursive",
      ].includes(c.theme[key])
    )
      throw new Error("Unsupported font.");
  const number = (obj, key, min, max) => {
    if (!Number.isFinite(obj[key]) || obj[key] < min || obj[key] > max)
      throw new Error(`Invalid ${key}; expected ${min}–${max}.`);
  };
  for (const [k, a, b] of [
    ["fontSize", 14, 30],
    ["headingSize", 40, 120],
    ["radius", 0, 40],
    ["spacing", 30, 180],
    ["letterWidth", 480, 1000],
    ["shadow", 0, 60],
    ["border", 0, 4],
  ])
    number(c.theme, k, a, b);
  for (const [k, a, b] of [
    ["quantity", 0, 40],
    ["size", 8, 40],
    ["speed", 5, 60],
    ["intensity", 0, 1],
  ])
    number(c.effects, k, a, b);
  number(c.gallery, "interval", 2, 60);
  number(c.music, "volume", 0, 1);
  number(c.music, "start", 0, 86400);
  for (const track of c.music.tracks) {
    if (track.start === undefined) track.start = c.music.start;
    if (track.end === undefined || track.end === "") track.end = null;
    number(track, "start", 0, 86400);
    if (track.end !== null) {
      number(track, "end", 0, 86400);
      if (track.end <= track.start)
        throw new Error("A song's end time must be after its start time.");
    }
  }
  if (
    c.music.autoAdvance !== undefined &&
    typeof c.music.autoAdvance !== "boolean"
  )
    throw new Error("Invalid playlist option.");
  const video = c.theme.video;
  for (const [key, min, max] of [
    ["start", 0, 86400],
    ["speed", 0.25, 2],
    ["opacity", 0, 1],
    ["overlay", 0, 1],
    ["blur", 0, 20],
    ["paperOpacity", 0, 1],
  ])
    number(video, key, min, max);
  for (const key of ["enabled", "autoplay", "loop", "mobile", "reduceMotion"])
    if (typeof video[key] !== "boolean")
      throw new Error("Invalid video option.");
  if (
    !["cover", "contain"].includes(video.fit) ||
    !["center", "top", "bottom", "left", "right"].includes(video.position)
  )
    throw new Error("Invalid video framing.");
  if (
    c.theme.transparent !== undefined &&
    typeof c.theme.transparent !== "boolean"
  )
    throw new Error("Invalid transparency option.");
  for (const s of c.sections) {
    number(s, "spacing", 20, 180);
    if (s.background && !/^#[\da-f]{6}$/i.test(s.background))
      throw new Error("Invalid section color.");
  }
  const media = (v) => !v || /^\/media\/[a-f\d-]{36}$/.test(v);
  for (const v of [
    c.theme.backgroundImage,
    video.src,
    video.poster,
    c.settings.favicon,
    c.settings.socialImage,
    ...c.gallery.items.map((x) => x.src),
    ...c.music.tracks.map((x) => x.src),
  ])
    if (!media(v)) throw new Error("Choose an uploaded asset from Media.");
  return c;
}
export function referencedMedia(config) {
  return new Set(JSON.stringify(config).match(/\/media\/[a-f\d-]{36}/g) || []);
}
