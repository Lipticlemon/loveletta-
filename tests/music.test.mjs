import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import {
  parseTime,
  formatTime,
  trackWindow,
  musicMarkup,
  mountMusicPlayer,
} from "../shared/music.js";
import { cloneDefaults } from "../shared/defaults.js";
import { validateConfig } from "../shared/validation.js";
const tracks = [
  {
    id: "one",
    name: "First song",
    src: "/media/00000000-0000-0000-0000-000000000001",
    start: 45,
    end: 90,
  },
  {
    id: "two",
    name: "Second song",
    src: "/media/00000000-0000-0000-0000-000000000002",
    start: 15,
    end: 30,
  },
];
function fixture(t, options = {}) {
  const music = {
    ...cloneDefaults().music,
    enabled: true,
    tracks: structuredClone(tracks),
    loop: false,
    ...options,
  };
  const { window } = parseHTML(
    "<html><body>" + musicMarkup(music) + "</body></html>",
  );
  const root = window.document.body,
    audio = root.querySelector("#audio");
  audio.paused = true;
  audio.currentTime = 0;
  audio.duration = 240;
  audio.playbackRate = 1;
  audio.load = () => {};
  audio.play = async () => {
    audio.paused = false;
    audio.dispatchEvent(new window.Event("play"));
  };
  audio.pause = () => {
    audio.paused = true;
    audio.dispatchEvent(new window.Event("pause"));
  };
  const player = mountMusicPlayer(root, music, { preview: true });
  const event = (name) => audio.dispatchEvent(new window.Event(name));
  event("loadedmetadata");
  t.after(() => player.destroy());
  return { root, audio, event, window, player };
}
test("timestamp parser supports exact seconds, minutes, hours, decimals, and natural end", () => {
  assert.equal(parseTime("0:45"), 45);
  assert.equal(parseTime("1:15.5"), 75.5);
  assert.equal(parseTime("1:02:03"), 3723);
  assert.equal(parseTime("75.25"), 75.25);
  assert.equal(parseTime(""), null);
  assert.equal(formatTime(75.5), "1:15.5");
  assert.equal(formatTime(3723), "1:02:03");
  for (const v of ["-1", "1:75", "0:60", "abc", "1:2:3:4"])
    assert.throws(() => parseTime(v));
});
test("clip end is clamped to actual duration and impossible starts are rejected", () => {
  assert.deepEqual(trackWindow({ start: 45, end: 900 }, 100), {
    start: 45,
    end: 100,
    valid: true,
  });
  assert.equal(trackWindow({ start: 110, end: null }, 100).valid, false);
  assert.deepEqual(trackWindow({}, 100, 15), {
    start: 15,
    end: 100,
    valid: true,
  });
});
test("server validation rejects reversed excerpts and preserves legacy starting times", () => {
  const c = cloneDefaults();
  c.music.start = 12;
  c.music.tracks = [{ id: "a", name: "Song", src: tracks[0].src }];
  const normalized = validateConfig(c);
  assert.equal(normalized.music.tracks[0].start, 12);
  assert.equal(normalized.music.tracks[0].end, null);
  c.music.tracks[0].start = 90;
  c.music.tracks[0].end = 45;
  assert.throws(() => validateConfig(c), /after its start/);
});
test("floating player seeks to start and stops at the custom end", (t) => {
  const { root, audio, event } = fixture(t);
  assert.equal(audio.currentTime, 45);
  assert.equal(root.querySelector("#music-seek").min, "45");
  assert.equal(root.querySelector("#music-seek").max, "90");
  root.querySelector("#music-toggle").click();
  assert.equal(audio.paused, false);
  audio.currentTime = 90;
  event("timeupdate");
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 90);
  assert.match(root.querySelector("#music-status").textContent, /FINISHED/);
  root.querySelector("#music-toggle").click();
  assert.equal(audio.currentTime, 45);
  assert.equal(audio.paused, false);
});
test("loop repeats only the selected range", (t) => {
  const { root, audio, event } = fixture(t, { loop: true });
  root.querySelector("#music-toggle").click();
  audio.currentTime = 90;
  event("timeupdate");
  assert.equal(audio.currentTime, 45);
  assert.equal(audio.paused, false);
});
test("playlist switching uses each song range and names", (t) => {
  const { root, audio, event } = fixture(t);
  root.querySelector("#playlist-toggle").click();
  assert.equal(root.querySelector("#music-playlist").hidden, false);
  root.querySelectorAll(".playlist-row")[1].click();
  event("loadedmetadata");
  assert.equal(root.querySelector("#track-name").textContent, "Second song");
  assert.equal(audio.currentTime, 15);
  assert.equal(root.querySelector("#music-seek").max, "30");
  assert.equal(root.querySelector("#music-playlist").hidden, true);
  root.querySelector("#music-next").click();
  event("loadedmetadata");
  assert.equal(audio.currentTime, 45);
});
test("optional auto advance selects the next song after its excerpt", (t) => {
  const { root, audio, event } = fixture(t, { autoAdvance: true });
  root.querySelector("#music-toggle").click();
  audio.currentTime = 90;
  event("timeupdate");
  event("loadedmetadata");
  assert.equal(root.querySelector("#track-name").textContent, "Second song");
  assert.equal(audio.currentTime, 15);
  assert.equal(audio.paused, false);
});
test("seeking and volume stay within player controls", (t) => {
  const { root, audio, window } = fixture(t);
  const seek = root.querySelector("#music-seek");
  seek.value = "200";
  seek.dispatchEvent(new window.Event("input"));
  assert.equal(audio.currentTime, 90);
  seek.value = "0";
  seek.dispatchEvent(new window.Event("input"));
  assert.equal(audio.currentTime, 45);
  const volume = root.querySelector("#music-volume");
  volume.value = ".25";
  volume.dispatchEvent(new window.Event("input"));
  assert.equal(audio.volume, 0.25);
});
test("empty playlist stays visible with disabled play instead of broken audio", (t) => {
  const { root } = fixture(t, { tracks: [] });
  assert.equal(root.querySelector("#music-toggle").disabled, true);
  assert.match(root.querySelector("#music-status").textContent, /ON ITS WAY/);
});
test("end timer stops the excerpt even without a timeupdate event", async (t) => {
  const { root, audio } = fixture(t, {
    tracks: [{ ...tracks[0], start: 0, end: 0.02 }],
  });
  root.querySelector("#music-toggle").click();
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 0.02);
});
test("lyrics use the original song clock, honor offsets, escape HTML, and switch with songs", (t) => {
  const songs = structuredClone(tracks);
  songs[0].lyrics =
    "[00:40]Before\n[00:45]<img src=x onerror=alert(1)>\n[01:00]Next";
  songs[0].lyricsOffset = 1;
  songs[1].lyrics = "A plain lyric";
  const { root, audio, event } = fixture(t, { tracks: songs });
  root.querySelector("#lyrics-toggle").click();
  assert.equal(root.querySelector("#music-lyrics").hidden, false);
  assert.equal(root.querySelector("#music-lyrics img"), null);
  assert.equal(root.querySelector(".lyric-line.active").textContent, "Before");
  audio.currentTime = 46;
  event("timeupdate");
  assert.match(root.querySelector(".lyric-line.active").textContent, /<img/);
  root.querySelector("#playlist-toggle").click();
  assert.equal(root.querySelector("#music-lyrics").hidden, true);
  root.querySelector("#music-next").click();
  assert.match(
    root.querySelector("#music-lyrics").textContent,
    /A plain lyric/,
  );
  assert.equal(root.querySelector(".lyric-line.active"), null);
});
