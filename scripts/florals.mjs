import { writeFile, mkdir } from "node:fs/promises";
await mkdir("shared/assets", { recursive: true });
function blossom(x, y, r, angle = 0) {
  let s = `<g transform="translate(${x} ${y}) rotate(${angle})">`;
  for (let ring = 0; ring < 4; ring++) {
    const count = ring === 0 ? 9 : ring === 1 ? 8 : ring === 2 ? 7 : 5;
    for (let i = 0; i < count; i++) {
      const a = (i * 360) / count + ring * 23,
        scale = 1 - ring * 0.19;
      s += `<ellipse transform="rotate(${a})" cx="${r * 0.28 * scale}" cy="${-r * 0.35 * scale}" rx="${r * 0.43 * scale}" ry="${r * 0.65 * scale}" fill="url(#p${ring % 3})" stroke="#be6981" stroke-width=".6" opacity=".96"/>`;
    }
  }
  s += `<circle r="${r * 0.1}" fill="#b35b75"/><g stroke="#efd2a1" stroke-width="1.6">`;
  for (let i = 0; i < 12; i++)
    s += `<path transform="rotate(${i * 30})" d="M0 0L0 -${r * 0.16}"/>`;
  return s + "</g></g>";
}
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 780"><defs><radialGradient id="p0" cx=".25" cy=".1" r="1"><stop stop-color="#fff3ef"/><stop offset=".4" stop-color="#efb5bf"/><stop offset="1" stop-color="#cc758e"/></radialGradient><radialGradient id="p1" cx=".2" cy=".15" r=".95"><stop stop-color="#ffe6e5"/><stop offset=".6" stop-color="#e89bb0"/><stop offset="1" stop-color="#bc5d7b"/></radialGradient><radialGradient id="p2" cx=".5" cy=".1" r=".9"><stop stop-color="#fce6e2"/><stop offset="1" stop-color="#df93a6"/></radialGradient><linearGradient id="leaf" x2="1" y2="1"><stop stop-color="#bec3a0"/><stop offset="1" stop-color="#6b8467"/></linearGradient></defs><g fill="none" stroke="#87947a" stroke-width="2"><path d="M70 800Q260 480 420 70M130 740Q80 410 60 260M185 610Q335 510 500 400M270 390Q195 300 175 130M340 270Q480 235 520 130"/></g>`;
for (const [x, y, a, scale] of [
  [90, 650, -50, 1.2],
  [140, 550, -120, 1],
  [200, 500, -20, 1.3],
  [245, 430, -115, 1],
  [300, 350, -10, 1],
  [340, 260, -110, 0.9],
  [390, 160, 20, 0.7],
  [105, 420, -95, 0.8],
  [80, 350, -35, 0.8],
  [410, 460, 0, 1],
  [460, 420, -60, 0.7],
  [210, 300, -100, 0.7],
  [190, 220, -150, 0.8],
  [450, 230, -30, 0.7],
])
  svg += `<g transform="translate(${x} ${y}) rotate(${a}) scale(${scale})"><path d="M0 0Q-60 -72 -5 -110Q42 -60 0 0" fill="url(#leaf)" opacity=".8"/><path d="M0 -2L-5 -96M-3 -30L-24 -53M-4 -50L14 -71" fill="none" stroke="#dce0c2" stroke-width="1"/></g>`;
for (const p of [
  [143, 620, 79, -15],
  [309, 477, 69, 20],
  [260, 325, 45, -20],
  [401, 222, 54, 5],
  [433, 92, 24, 10],
  [83, 343, 37, -20],
  [179, 156, 28, 5],
  [467, 396, 34, 20],
])
  svg += blossom(...p);
svg += "</svg>";
svg = svg.replace(/-?\d+\.\d{3,}/g, (n) =>
  String(Number(Number(n).toFixed(2))),
);
await writeFile("shared/assets/floral.svg", svg);
