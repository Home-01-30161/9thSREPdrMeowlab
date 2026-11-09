/**
 * Next.js Instrumentation Hook - runs once on server startup (both dev and prod).
 * Verifies the chat tables exist in Neon.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) return;

  try {
    const { MIGRATIONS_HINT, tablesAccessible } = await import('./lib/db');

    if (await tablesAccessible()) {
      console.log('✓ Neon chat tables verified.');
    } else {
      console.log('\n╔══════════════════════════════════════════════════════════╗');
      console.log('║  SETUP REQUIRED: Neon chat tables not found             ║');
      console.log('║  Please run the SQL in:                                  ║');
      console.log(`║  ${MIGRATIONS_HINT.padEnd(56)}║`);
      console.log('║  in your Neon SQL Editor.                                ║');
      console.log('╚══════════════════════════════════════════════════════════╝\n');
    }
  } catch (e) {
    console.warn('Neon table check failed:', e);
  }
}
