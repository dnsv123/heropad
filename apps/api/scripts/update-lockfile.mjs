// Regenerates apps/api/package-lock.json, the lockfile Railway installs from.
//
// Railway builds only the apps/api folder, so it never sees the monorepo's
// root lockfile. Without a lockfile of its own it installed whatever was
// newest at build time. On 7 Oct 2026 that was a Supabase release two minutes
// old, whose tarball was not on the registry yet, and the build failed.
//
// With this lockfile Railway installs exactly the versions we tested, all of
// them published at least 7 days earlier (--before). That is the same rule as
// the local ~/.npmrc, which npm does not apply when it writes a lockfile.
//
// Run after any change to apps/api/package.json:  npm run lock:api
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = path.join(api, 'package-lock.json');
const before = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
// A copy outside the monorepo: inside it, npm would rewrite the root lockfile instead.
const tmp = mkdtempSync(path.join(tmpdir(), 'heropad-api-lock-'));
try {
  cpSync(path.join(api, 'package.json'), path.join(tmp, 'package.json'));
  // Start from the current lockfile, so versions only move where package.json asks for it.
  if (existsSync(lock)) cpSync(lock, path.join(tmp, 'package-lock.json'));
  execSync(`npm install --package-lock-only --ignore-scripts --no-audit --no-fund --before=${before}`, {
    cwd: tmp,
    stdio: 'inherit',
  });
  cpSync(path.join(tmp, 'package-lock.json'), lock);
  console.log(`apps/api/package-lock.json updated: every version published before ${before}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
