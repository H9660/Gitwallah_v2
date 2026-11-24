// "Build" step for this plain-ESM backend: there is no compiler, so the
// closest equivalent is parsing every source file with `node --check`.
// Exits non-zero (and lists the files) if any file has a syntax error.
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { spawnSync } from 'child_process';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const skip = new Set(['node_modules', '.git', 'coverage']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(m?js)$/.test(name)) out.push(p);
  }
  return out;
}

const failed = [];
const files = walk(root);
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf-8' });
  if (r.status !== 0) failed.push(`${relative(root, f)}\n${r.stderr}`);
}

if (failed.length) {
  console.error(`Syntax check failed in ${failed.length} file(s):\n\n${failed.join('\n')}`);
  process.exit(1);
}
console.log(`Syntax check passed (${files.length} files).`);
