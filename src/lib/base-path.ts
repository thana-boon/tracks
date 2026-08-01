/**
 * The path prefix the app is mounted under in production (`/tracks` behind the
 * school's nginx). Set once, at BUILD time, via NEXT_PUBLIC_BASE_PATH — the
 * value is inlined into the client bundle, so it cannot be changed by editing
 * the runtime environment; rebuild the image to move the app to another prefix.
 *
 * `next.config.mjs` reads the same variable for `basePath`, which already
 * covers <Link>, useRouter(), redirect() and the /_next/* asset URLs. What it
 * does NOT cover is a raw URL string we hand to the browser ourselves —
 * `fetch('/api/…')`, an <a href> download, an <img src>. Those go through
 * `withBasePath()` here.
 *
 * Left empty for `npm run dev`, where the app is served from the root.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Prefix an app-absolute path ("/api/photo/7") with the deployment's basePath. */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
