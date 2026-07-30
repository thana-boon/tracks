// Best-effort: fetch IBM Plex Sans Thai TTFs for server-side PDF rendering.
// @react-pdf/renderer needs TTF (not woff2), and Thai glyphs need this family.
// Non-fatal: if the network is unavailable at build time the app still builds;
// PDFs will fall back to a Latin font until the files are present.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const DEST = join(process.cwd(), 'public', 'fonts');
const BASE =
  'https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsansthai';
const FILES = [
  'IBMPlexSansThai-Regular.ttf',
  'IBMPlexSansThai-SemiBold.ttf',
  'IBMPlexSansThai-Bold.ttf',
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
  for (const name of FILES) {
    const dest = join(DEST, name);
    if (await exists(dest)) {
      console.log(`[fonts] ${name} already present`);
      continue;
    }
    try {
      const res = await fetch(`${BASE}/${name}`);
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
