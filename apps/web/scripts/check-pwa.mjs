// Validates the generated web app manifest and the files it references.
// Usage: start the app (`npm run start`) then run `npm run check:pwa`.
import { access } from "node:fs/promises";
import path from "node:path";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${message}`);
  if (!ok) failures.push(message);
};

const res = await fetch(`${base}/manifest.webmanifest`);
check(res.ok, `manifest responds 200 (${res.status})`);
const m = await res.json();

for (const key of ["name", "short_name", "start_url", "scope", "display", "background_color", "theme_color", "icons"]) {
  check(m[key] !== undefined && m[key] !== "", `manifest has "${key}"`);
}
check(m.display === "standalone", "display is standalone");
check(m.start_url === "/", "start_url is /");

const sizes = new Set((m.icons ?? []).map((i) => i.sizes));
check(sizes.has("192x192"), "has 192x192 icon");
check(sizes.has("512x512"), "has 512x512 icon");
check((m.icons ?? []).some((i) => i.purpose === "maskable"), "has maskable icon");

for (const icon of m.icons ?? []) {
  const r = await fetch(`${base}${icon.src}`);
  check(r.ok && (r.headers.get("content-type") ?? "").includes("image/png"), `icon ${icon.src} is served as PNG`);
}

const sw = await fetch(`${base}/sw.js`);
check(sw.ok && (sw.headers.get("content-type") ?? "").includes("javascript"), "service worker /sw.js served as JavaScript");
const offline = await fetch(`${base}/offline`);
check(offline.ok, "/offline fallback page responds 200");
const home = await (await fetch(base)).text();
check(home.includes('rel="manifest"'), "HTML links the manifest");
check(home.includes("apple-touch-icon"), "HTML links apple-touch-icon");
check(home.includes("viewport-fit=cover"), "viewport uses viewport-fit=cover");

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
await access(path.resolve(REPO_ROOT, "Assets/logo.png")).then(
  () => check(true, "original Assets/logo.png still present"),
  () => check(false, "original Assets/logo.png missing"),
);

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll PWA checks passed");
