// LRC timestamps use the original song clock, including when an excerpt is selected.
export function parseLyrics(text = "") {
  const lines = String(text).replaceAll("\r", "").split("\n");
  const cues = [];
  const plain = [];
  for (const line of lines) {
    const tags = [
      ...line.matchAll(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g),
    ];
    if (tags.length) {
      const words = line
        .replace(/\[\d{1,3}:[0-5]\d(?:[.:]\d{1,3})?\]/g, "")
        .trim();
      for (const tag of tags)
        cues.push({
          time:
            Number(tag[1]) * 60 +
            Number(tag[2]) +
            Number("0." + (tag[3] || "0")),
          text: words,
        });
    } else if (!/^\[(?:ar|ti|al|by|offset|length):.*\]$/i.test(line.trim()))
      plain.push(line);
  }
  return cues.length
    ? { timed: true, lines: cues.sort((a, b) => a.time - b.time) }
    : { timed: false, lines: plain.map((text) => ({ time: null, text })) };
}
export function lyricIndex(lyrics, time, offset = 0) {
  if (!lyrics.timed) return -1;
  let index = -1;
  for (let i = 0; i < lyrics.lines.length; i++) {
    if (lyrics.lines[i].time + offset > time) break;
    index = i;
  }
  return index;
}
