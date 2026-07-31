// Best-effort: fetch the Thai TTFs used for server-side PDF rendering.
// @react-pdf/renderer needs TTF (not woff2), and Thai glyphs need these families.
//
//   IBM Plex Sans Thai — screen-ish reports (ใบเช็คชื่อ, รายงานห้องที่ปรึกษา)
//   Sarabun           — official documents (ทรานสคริปต์); the standard Thai
//                       government document face, so it is what a signed
//                       transcript is expected to be set in.
//
// Non-fatal: if the network is unavailable at build time the app still builds;
// PDFs will fall back to a Latin font until the files are present.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const DEST = join(process.cwd(), 'public', 'fonts');
const GF = 'https://raw.githubusercontent.com/google/fonts/main/ofl';
const FILES = [
  ['ibmplexsansthai', 'IBMPlexSansThai-Regular.ttf'],
  ['ibmplexsansthai', 'IBMPlexSansThai-SemiBold.ttf'],
  ['ibmplexsansthai', 'IBMPlexSansThai-Bold.ttf'],
  ['sarabun', 'Sarabun-Regular.ttf'],
  ['sarabun', 'Sarabun-SemiBold.ttf'],
  ['sarabun', 'Sarabun-Bold.ttf'],
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(DEST, { recursive: true });
  for (const [dir, name] of FILES) {
    const dest = join(DEST, name);
    if (await exists(dest)) {
      console.log(`[fonts] ${name} already present`);
      continue;
    }
    try {
      const res = await fetch(`${GF}/${dir}/${name}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(dest, buf);
      console.log(`[fonts] downloaded ${name} (${buf.length} bytes)`);
    } catch (e) {
      console.warn(`[fonts] skip ${name}: ${e.message} (PDF Thai may not render)`);
    }
  }
}

main().catch((e) => {
  console.warn('[fonts] font fetch failed (non-fatal):', e.message);
});
