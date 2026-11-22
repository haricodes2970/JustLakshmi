// Derives PWA icons and in-app brand marks from the official logo.
// Reads Assets/logo.png (never modified) and writes only into public/.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SRC = path.resolve("Assets/logo.png");
const ICONS = path.resolve("public/icons");
const BRAND = path.resolve("public/brand");
await mkdir(ICONS, { recursive: true });
await mkdir(BRAND, { recursive: true });

const meta = await sharp(SRC).metadata();
const size = meta.width ?? 1254;

// The source is a white rounded square on black corners. Replace the corners with
// white so the artwork becomes a flat, full-bleed white square (OS applies its own mask).
const radius = Math.round(size * 0.19);
const mask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
);
const flat = await sharp({
  create: { width: size, height: size, channels: 3, background: "#ffffff" },
})
  .composite([
    {
      input: await sharp(SRC).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer(),
    },
  ])
  .flatten({ background: "#ffffff" })
  .png()
  .toBuffer();

const square = (px, file, dir = ICONS) => sharp(flat).resize(px, px).png({ compressionLevel: 9 }).toFile(path.join(dir, file));

// Maskable: artwork scaled into the central 80% safe zone on white.
async function maskable(px, file) {
  const inner = Math.round(px * 0.8);
  const art = await sharp(flat).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: px, height: px, channels: 3, background: "#ffffff" } })
    .composite([{ input: art, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(ICONS, file));
}

await Promise.all([
  square(192, "icon-192.png"),
  square(512, "icon-512.png"),
  square(180, "apple-touch-icon.png"),
  square(32, "favicon-32.png"),
  maskable(512, "maskable-512.png"),
  // Full logo for in-app use (settings, offline screen).
  square(512, "logo-full.png", BRAND),
  // Lotus mark only (no wordmark) for compact headers.
  sharp(flat)
    .extract({ left: Math.round(size * 0.17), top: Math.round(size * 0.07), width: Math.round(size * 0.77), height: Math.round(size * 0.55) })
    .resize({ width: 320 })
    .png({ compressionLevel: 9 })
    .toFile(path.join(BRAND, "mark.png")),
]);

console.log("Icons written to public/icons and public/brand");
