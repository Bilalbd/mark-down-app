/**
 * Warms a freshly started Vite dev server by requesting the app's entry module and every module
 * it imports statically, so Vite transforms them (and pre-bundles dependencies) before the app
 * starts. Without this the first page load can take longer than the startup watchdog's 15 s, and
 * the app relaunches itself. Used by launch.ps1.
 * Usage: node scripts/checks/warm-vite.mjs [origin]   (default http://localhost:1420)
 */
const origin = process.argv[2] ?? 'http://localhost:1420';
const seen = new Set();
// Static imports and re-exports in Vite's transformed output: `from "/src/x.ts"`, `import "/y"`.
const IMPORT = /(?:\bfrom\s*|\bimport\s*)["'](\/[^"']+)["']/g;

async function visit(path) {
  if (seen.has(path)) return;
  seen.add(path);
  let text;
  try {
    const res = await fetch(origin + path);
    if (!res.ok) return;
    text = await res.text();
  } catch {
    return;
  }
  const next = [...text.matchAll(IMPORT)].map((m) => m[1]);
  await Promise.all(next.map(visit));
}

const t0 = Date.now();
await fetch(origin + '/').catch(() => undefined);
await visit('/@vite/client');
await visit('/src/main.tsx');
console.log(`Warmed Vite: ${seen.size} modules in ${Date.now() - t0} ms`);
