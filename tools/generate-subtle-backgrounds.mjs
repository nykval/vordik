import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const width = 700;
const height = 525;
const patternColor = "#DFE6FF";
const outputDir = path.resolve("outputs/backgrounds");

const colorways = [
  { background: "#EEF2FF", main: "#355CFF", strength: 0.09 },
  { background: "#B9EFFF", main: "#39C9F4", strength: 0.2 },
  { background: "#B2F4E5", main: "#26D6B0", strength: 0.2 },
  { background: "#BEF4CF", main: "#45D875", strength: 0.2 },
  { background: "#E8F7AE", main: "#C4E747", strength: 0.2 },
  { background: "#FFF0AD", main: "#FFD43B", strength: 0.22 },
  { background: "#FFD4AC", main: "#FF943D", strength: 0.2 },
  { background: "#FFC6BD", main: "#FF7866", strength: 0.18 },
  { background: "#FFD0E8", main: "#F66FB1", strength: 0.2 },
  { background: "#DCD0FF", main: "#A27AF5", strength: 0.2 },
];

function mixHex(first, second, fraction) {
  const a = first.slice(1).match(/../g).map((part) => parseInt(part, 16));
  const b = second.slice(1).match(/../g).map((part) => parseInt(part, 16));
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * fraction).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function grid(dx, dy, draw, { stagger = 0, xStart = 20, yStart = 20 } = {}) {
  const parts = [];
  let row = 0;
  for (let y = yStart; y < height + dy; y += dy, row += 1) {
    for (let x = xStart - dx; x < width + dx; x += dx) {
      parts.push(draw(x + (row % 2 ? stagger : 0), y, row));
    }
  }
  return parts.join("\n");
}

const patterns = [
  {
    file: "01-diagonal-dashes",
    label: "Диагональные штрихи",
    artwork: grid(51, 47, (x, y) => `<path d="M${x - 7} ${y + 7}l14-14" stroke="${patternColor}" stroke-width="4" stroke-linecap="round"/>`, { stagger: 24 }),
  },
  {
    file: "02-staggered-dots",
    label: "Круглые точки",
    artwork: grid(43, 43, (x, y) => `<circle cx="${x}" cy="${y}" r="5.5" fill="${patternColor}"/>`, { stagger: 21 }),
  },
  {
    file: "03-tilted-ovals",
    label: "Наклонные овалы",
    artwork: grid(59, 49, (x, y) => `<ellipse cx="${x}" cy="${y}" rx="11" ry="5" transform="rotate(-28 ${x} ${y})" fill="${patternColor}"/>`, { stagger: 29 }),
  },
  {
    file: "04-open-rings",
    label: "Тонкие кольца",
    artwork: grid(62, 58, (x, y) => `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="${patternColor}" stroke-width="3.5"/>`, { stagger: 31 }),
  },
  {
    file: "05-small-crosses",
    label: "Маленькие крестики",
    artwork: grid(60, 56, (x, y) => `<path d="M${x - 7} ${y}h14M${x} ${y - 7}v14" fill="none" stroke="${patternColor}" stroke-width="4" stroke-linecap="round"/>`, { stagger: 30 }),
  },
  {
    file: "06-arc-scales",
    label: "Дуги",
    artwork: grid(56, 54, (x, y, row) => `<path d="M${x - 11} ${y + (row % 2 ? -4 : 5)}q11 ${row % 2 ? 14 : -14} 22 0" fill="none" stroke="${patternColor}" stroke-width="4" stroke-linecap="round"/>`, { stagger: 28 }),
  },
  {
    file: "07-short-bars",
    label: "Короткие линии",
    artwork: grid(50, 48, (x, y, row) => `<path d="M${x - (row % 2 ? 9 : 6)} ${y}h${row % 2 ? 18 : 12}" stroke="${patternColor}" stroke-width="5" stroke-linecap="round"/>`, { stagger: 25 }),
  },
  {
    file: "08-chevrons",
    label: "Шевроны",
    artwork: grid(62, 57, (x, y) => `<path d="M${x - 8} ${y - 4}l8 8 8-8" fill="none" stroke="${patternColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`, { stagger: 31 }),
  },
  {
    file: "09-dot-pairs",
    label: "Пары точек",
    artwork: grid(64, 55, (x, y, row) => `<circle cx="${x - 7}" cy="${y - 3}" r="5" fill="${patternColor}"/><circle cx="${x + 8}" cy="${y + (row % 2 ? 6 : 5)}" r="3" fill="${patternColor}"/>`, { stagger: 32 }),
  },
  {
    file: "10-soft-waves",
    label: "Короткие волны",
    artwork: grid(74, 58, (x, y) => `<path d="M${x - 17} ${y}c6-7 11-7 17 0s11 7 17 0" fill="none" stroke="${patternColor}" stroke-width="3.5" stroke-linecap="round"/>`, { stagger: 37 }),
  },
];

function svg(artwork, colorway, scale = 1) {
  const darker = mixHex(colorway.background, colorway.main, colorway.strength);
  const recolored = artwork.replaceAll(patternColor, darker);
  const shapes = scale === 1
    ? recolored
    : `<g transform="translate(350 262.5) scale(${scale}) translate(-350 -262.5)">${recolored}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${colorway.background}"/>${shapes}</svg>`;
}

await mkdir(outputDir, { recursive: true });
const normalThumbs = [];
const allThumbs = [];
for (const [index, pattern] of patterns.entries()) {
  for (const enlarged of [false, true]) {
    const filename = enlarged
      ? `${String(index + 11).padStart(2, "0")}-${pattern.file.slice(3)}-larger`
      : pattern.file;
    const source = svg(pattern.artwork, colorways[index], enlarged ? 1.35 : 1);
    const prefix = path.join(outputDir, filename);
    await writeFile(`${prefix}.svg`, source);
    const png = await sharp(Buffer.from(source)).png().toBuffer();
    await writeFile(`${prefix}.png`, png);
    const item = {
      input: await sharp(png).resize(280, 210).png().toBuffer(),
      left: 12 + (index % 5) * 292,
      top: 12 + (Math.floor(index / 5) + (enlarged ? 2 : 0)) * 246,
    };
    allThumbs.push(item);
    if (!enlarged) normalThumbs.push(item);
  }
}

const normalContact = await sharp({
  create: { width: 1472, height: 504, channels: 4, background: "#FFFFFF" },
}).composite(normalThumbs).png().toBuffer();
await writeFile(path.join(outputDir, "preview-all-10.png"), normalContact);

const allContact = await sharp({
  create: { width: 1472, height: 996, channels: 4, background: "#FFFFFF" },
}).composite(allThumbs).png().toBuffer();
await writeFile(path.join(outputDir, "preview-all-20.png"), allContact);

console.log(`Created ${patterns.length * 2} backgrounds in ${outputDir}`);
