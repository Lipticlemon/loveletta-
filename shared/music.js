const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const media = (value) => /^\/media\/[a-f\d-]{36}$/.test(value || "");
export function formatTime(value, precision = 1) {
  if (!Number.isFinite(value)) return "End";
  const scale = 10 ** precision,
    units = Math.round(Math.max(0, value) * scale),
    seconds = Math.floor(units / scale);
  const fraction =
    units % scale
      ? "." +
        String(units % scale)
          .padStart(precision, "0")
          .replace(/0+$/, "")
      : "";
  const minutes = Math.floor(seconds / 60),
    hours = Math.floor(minutes / 60);
  return (
    (hours ? hours + ":" + String(minutes % 60).padStart(2, "0") : minutes) +
    ":" +
    String(seconds % 60).padStart(2, "0") +
    fraction
  );
}
export function parseTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(text))
    throw Error("Use seconds, m:ss, or h:mm:ss, such as 1:15.5.");
  const parts = text.split(":").map(Number);
  if (parts.length > 1 && parts.slice(1).some((n) => n >= 60))
    throw Error("Minutes and seconds after a colon must be below 60.");
  const seconds = parts.reduce((total, n) => total * 60 + n, 0);
  if (seconds > 86400) throw Error("Choose a time within 24 hours.");
  return seconds;
}
export function trackWindow(track, duration = Infinity, legacyStart = 0) {
  const start = Number.isFinite(track.start) ? track.start : legacyStart || 0;
  const configuredEnd = Number.isFinite(track.end) ? track.end : Infinity;
  const end = Math.min(
    configuredEnd,
    Number.isFinite(duration) && duration > 0 ? duration : Infinity,
  );
  return {
    start,
    end,
    valid: Number.isFinite(start) && start >= 0 && end > start,
  };
}
export function musicMarkup(music) {
  if (!music.enabled) return "";
  return `<section class="music-player playlist-player ${music.design === "square" ? "square" : ""}" aria-label="Floating music player"><div class="music-heading"><span class="music-flower" aria-hidden="true">♫</span><div class="music-now"><span id="track-name">Our soundtrack</span><small id="music-status" role="status">A LITTLE MUSIC, JUST FOR US</small></div><button id="playlist-toggle" aria-label="Choose a song" aria-expanded="false" aria-controls="music-playlist">≡</button></div><div id="music-playlist" class="music-playlist" hidden><p class="playlist-label">OUR LITTLE PLAYLIST</p><div id="playlist-tracks"></div></div><div class="music-transport"><button id="music-previous" aria-label="Previous song">‹</button><button id="music-toggle" aria-label="Play music">▶</button><button id="music-next" aria-label="Next song">›</button><label class="music-volume"><span class="sr-only">Music volume</span><span aria-hidden="true">♪</span><input id="music-volume" type="range" min="0" max="1" step="0.01" aria-label="Music volume"></label></div><div class="music-progress"><label class="sr-only" for="music-seek">Seek within the selected song excerpt</label><input id="music-seek" type="range" min="0" max="1" value="0" step="0.1" disabled><div class="music-times"><time id="music-current">0:00</time><span id="music-clip">Choose your song</span><time id="music-end">—</time></div></div><audio id="audio" preload="metadata"></audio></section>`;
}
export function mountMusicPlayer(root, music, { preview = false } = {}) {
  const audio = root.querySelector("#audio");
  if (!audio) return { play: async () => {}, destroy: () => {} };
  const button = root.querySelector("#music-toggle"),
    status = root.querySelector("#music-status"),
    seek = root.querySelector("#music-seek"),
    playlist = root.querySelector("#music-playlist"),
    toggle = root.querySelector("#playlist-toggle");
  const tracks = music.tracks.filter((t) => media(t.src));
  let index = Math.max(
      0,
      tracks.findIndex((t) => t.id === music.active),
    ),
    ready = false,
    window = { start: 0, end: Infinity, valid: true },
    ending = false,
    completed = false,
    requested = false,
    timer,
    destroyed = false;
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const label = (track) => {
    const range = trackWindow(track, Infinity, music.start);
    return formatTime(range.start, 3) + " – " + formatTime(range.end, 3);
  };
  root.querySelector("#playlist-tracks").innerHTML = tracks.length
    ? tracks
        .map(
          (t, i) =>
            `<button class="playlist-row" type="button" data-track-index="${i}" aria-label="Play ${escape(t.name)}"><span>${escape(t.name)}</span><small>${escape(label(t))}</small></button>`,
        )
        .join("")
    : '<p class="playlist-empty">A little music is on its way.</p>';
  const previous = root.querySelector("#music-previous"),
    next = root.querySelector("#music-next");
  previous.disabled = next.disabled = tracks.length < 2;
  const volume = root.querySelector("#music-volume");
  volume.value = String(music.volume);
  audio.volume = music.volume;
  audio.loop = false;
  volume.addEventListener("input", () => {
    audio.volume = Number(volume.value);
  });
  toggle.addEventListener("click", () => {
    playlist.hidden = !playlist.hidden;
    toggle.setAttribute("aria-expanded", String(!playlist.hidden));
  });
  const escapeKey = (event) => {
    if (event.key === "Escape" && !playlist.hidden) {
      playlist.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.focus();
    }
  };
  root.addEventListener("keydown", escapeKey);
  function refresh() {
    root.querySelector("#music-current").textContent = formatTime(
      audio.currentTime || window.start,
    );
    root.querySelector("#music-end").textContent = formatTime(window.end);
    root.querySelector("#music-clip").textContent = tracks.length
      ? label(tracks[index])
      : "YOUR SOUNDTRACK";
    if (ready && window.valid && Number.isFinite(window.end)) {
      seek.min = String(window.start);
      seek.max = String(window.end);
      seek.value = String(
        Math.min(
          window.end,
          Math.max(window.start, audio.currentTime || window.start),
        ),
      );
      seek.disabled = false;
    } else seek.disabled = true;
    root.querySelectorAll(".playlist-row").forEach((row, i) => {
      row.classList.toggle("selected", i === index);
      row.setAttribute("aria-current", String(i === index));
    });
  }
  function schedule() {
    clear();
    if (!ready || audio.paused || !window.valid || !Number.isFinite(window.end))
      return;
    const remaining =
      (window.end - audio.currentTime) / (audio.playbackRate || 1);
    if (remaining <= 0) {
      finish();
      return;
    }
    timer = setTimeout(finish, remaining * 1000);
  }
  async function play() {
    if (destroyed || !tracks.length) return;
    if (ready && !window.valid) {
      status.textContent = "START TIME IS PAST THE SONG END";
      return;
    }
    requested = true;
    completed = false;
    if (
      ready &&
      (audio.currentTime < window.start ||
        audio.currentTime >= window.end - 0.02)
    )
      audio.currentTime = window.start;
    try {
      await audio.play();
    } catch {
      requested = false;
      status.textContent = "TAP PLAY FOR A LITTLE MUSIC";
    }
  }
  function select(which, shouldPlay = false) {
    clear();
    ready = false;
    completed = false;
    requested = false;
    audio.pause();
    index = (which + tracks.length) % tracks.length;
    window = trackWindow(tracks[index], Infinity, music.start);
    audio.src = tracks[index].src;
    audio.load?.();
    root.querySelector("#track-name").textContent = tracks[index].name;
    status.textContent = "A SOUNDTRACK FOR US";
    refresh();
    if (shouldPlay) void play();
  }
  function finish() {
    if (completed || ending || destroyed || !ready || !window.valid) return;
    completed = true;
    ending = true;
    clear();
    const shouldContinue = requested || !audio.paused;
    audio.pause();
    requested = false;
    if (Number.isFinite(window.end)) audio.currentTime = window.end;
    refresh();
    status.textContent = "EXCERPT FINISHED";
    if (shouldContinue && music.loop) {
      audio.currentTime = window.start;
      void play();
    } else if (shouldContinue && music.autoAdvance && index < tracks.length - 1)
      select(index + 1, true);
    ending = false;
  }
  audio.addEventListener("loadedmetadata", () => {
    if (destroyed || !tracks.length) return;
    ready = true;
    window = trackWindow(tracks[index], audio.duration, music.start);
    if (!window.valid) {
      requested = false;
      audio.pause();
      status.textContent = "START TIME IS PAST THE SONG END";
      refresh();
      return;
    }
    audio.currentTime = window.start;
    refresh();
    if (requested && !audio.paused) schedule();
  });
  audio.addEventListener("play", () => {
    requested = true;
    button.textContent = "Ⅱ";
    button.setAttribute("aria-label", "Pause music");
    status.textContent = "PLAYING, JUST FOR YOU";
    schedule();
  });
  audio.addEventListener("playing", schedule);
  audio.addEventListener("pause", () => {
    clear();
    button.textContent = "▶";
    button.setAttribute("aria-label", "Play music");
  });
  audio.addEventListener("timeupdate", () => {
    refresh();
    if (ready && window.valid && audio.currentTime >= window.end) finish();
    else schedule();
  });
  audio.addEventListener("seeking", () => {
    if (!ready || !window.valid || ending) return;
    if (audio.currentTime < window.start) audio.currentTime = window.start;
    if (audio.currentTime > window.end) audio.currentTime = window.end;
    clear();
  });
  audio.addEventListener("seeked", () => {
    refresh();
    schedule();
  });
  audio.addEventListener("ratechange", schedule);
  audio.addEventListener("ended", () => {
    if (audio.currentTime >= window.end - 0.03) finish();
  });
  audio.addEventListener("error", () => {
    clear();
    requested = false;
    status.textContent = "SONG UNAVAILABLE · CHOOSE ANOTHER";
  });
  seek.addEventListener("input", () => {
    if (!ready || !window.valid) return;
    audio.currentTime = Math.min(
      window.end,
      Math.max(window.start, Number(seek.value)),
    );
    refresh();
    if (audio.currentTime >= window.end) {
      requested = false;
      audio.pause();
    } else schedule();
  });
  button.addEventListener("click", () => {
    if (audio.paused) void play();
    else {
      requested = false;
      audio.pause();
    }
  });
  previous.addEventListener("click", () => select(index - 1, true));
  next.addEventListener("click", () => select(index + 1, true));
  root.querySelectorAll(".playlist-row").forEach((row, i) =>
    row.addEventListener("click", () => {
      select(i, true);
      playlist.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }),
  );
  if (tracks.length) {
    select(index);
    if (music.mode === "entry" && !preview) void play();
  } else {
    button.disabled = true;
    status.textContent = "A LITTLE MUSIC IS ON ITS WAY";
    refresh();
  }
  return {
    play,
    destroy() {
      destroyed = true;
      requested = false;
      clear();
      root.removeEventListener("keydown", escapeKey);
      audio.pause();
      audio.removeAttribute("src");
      audio.load?.();
    },
  };
}
