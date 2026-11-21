// Solmar Heat — the entry program (Node 22, standard library only).
// Copies game/ and screenshots/ from this repository into the output
// directory and writes /output/dossier.json with the kit's buildDossier.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.
import { chmodSync, cpSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// A clean output every run: both grader runs must write the same bytes.
// NEVER remove outDir itself: in the grader it is a mounted volume, and
// removing a mount point fails with EBUSY ("Device or resource busy"),
// which aborts the run with exit 1. Instead, make sure it exists and
// remove only its contents.
// A leftover from a previous run can be read-only (a 555 directory, a 444
// file) because cpSync preserves source modes; rmSync then fails with EACCES.
// Make it writable first, then remove it. Symlinks are removed as-is.
function removeEntry(target: string): void {
  const stat = lstatSync(target);
  if (stat.isSymbolicLink()) {
    rmSync(target, { force: true });
    return;
  }
  if (stat.isDirectory()) {
    if ((stat.mode & 0o200) === 0) chmodSync(target, 0o755);
    for (const entry of readdirSync(target)) {
      removeEntry(join(target, entry));
    }
    rmSync(target, { recursive: true, force: true });
  } else {
    if ((stat.mode & 0o200) === 0) chmodSync(target, 0o644);
    rmSync(target, { force: true });
  }
}
mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(outDir)) {
  removeEntry(join(outDir, entry));
}
mkdirSync(join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });

cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);

console.log(`Solmar Heat handed in: game/ + screenshots/ + dossier.json -> ${outDir}`);
