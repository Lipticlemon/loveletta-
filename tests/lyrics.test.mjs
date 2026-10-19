import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLyrics, lyricIndex } from "../shared/lyrics.js";
test("LRC supports repeated time tags, fractions, blank cues and metadata", () => {
  const l = parseLyrics(
    "[ti:Our song]\n[00:45.25][01:30.250]Chorus\n[00:40]\n[01:00.5]Verse",
  );
  assert.equal(l.timed, true);
  assert.deepEqual(
    l.lines.map((l) => l.time),
    [40, 45.25, 60.5, 90.25],
  );
  assert.equal(lyricIndex(l, 39), -1);
  assert.equal(lyricIndex(l, 45.24), 0);
  assert.equal(lyricIndex(l, 45.25), 1);
  assert.equal(lyricIndex(l, 45.25, 1), 0);
  assert.equal(parseLyrics("One\n\nTwo").timed, false);
});
