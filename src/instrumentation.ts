/**
 * Next.js startup hook — runs once per server process, before the first
 * request. Used to bootstrap the first admin so the deployment has no
 * separate seed step to run (or to fail).
 *
 * The import MUST stay inside the `=== 'nodejs'` block, not after an early
 * return. This file is compiled for the edge runtime too (the project has
 * middleware), and Next inlines NEXT_RUNTIME per compilation so webpack can
 * dead-code-eliminate the whole branch. Outside the block the import is still
 * traced and the edge build fails on node:crypto.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { bootstrapAdmin } = await import('./lib/bootstrap');
    await bootstrapAdmin();
  }
}
