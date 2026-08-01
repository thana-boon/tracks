/**
 * Next.js startup hook — runs once per server process, before the first
 * request. Bootstraps the first admin (so the deployment has no separate seed
 * step to run, or to fail) and arms the background roster sync.
 *
 * The import MUST stay inside the `=== 'nodejs'` block, not after an early
 * return. This file is compiled for the edge runtime too (the project has
 * middleware), and Next inlines NEXT_RUNTIME per compilation so webpack can
 * dead-code-eliminate the whole branch. Outside the block the import is still
 * traced and the edge build fails on node:crypto.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { bootstrapAdmin, checkSessionConfig } = await import('./lib/bootstrap');
    // Before anything else: a session signed with the example secret is not a
    // session. Warns in development; in production this is a refusal to boot,
    // and exiting is the only way to make it one — a throw here is caught and
    // logged by Next, which would leave the server up and pretending.
    try {
      checkSessionConfig();
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
    await bootstrapAdmin();
    const { startAutoSync } = await import('./lib/auto-sync');
    startAutoSync();
  }
}
