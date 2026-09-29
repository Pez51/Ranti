import { mkdtemp, readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it('conserva bytes LF de las migraciones incluso con checkout core.autocrlf=true', async () => {
  const source = new URL('../src/db/migrations/', import.meta.url);
  const names = (await readdir(source)).filter((name) => name.endsWith('.sql'));
  const root = await mkdtemp(join(tmpdir(), 'ranti-lf-policy-'));
  const git = (args) => promisify(execFile)('git', args, { cwd: root });
  try {
    await git(['init', '--quiet']);
    await mkdir(join(root, 'server/src/db/migrations'), { recursive: true });
    for (const name of names) {
      const bytes = await readFile(new URL(name, source));
      expect(bytes.includes(13), `${name} debe usar LF`).toBe(false);
      await writeFile(join(root, 'server/src/db/migrations', name), bytes);
    }
    await writeFile(join(root, '.gitattributes'), await readFile(new URL('../../.gitattributes', import.meta.url)));
    await git(['-c', 'core.autocrlf=true', 'add', '.']);
    await git(['-c', 'core.autocrlf=true', 'checkout-index', '--all', '--prefix=checkout/']);
    for (const name of names) {
      expect(await readFile(join(root, 'checkout/server/src/db/migrations', name)))
        .toEqual(await readFile(new URL(name, source)));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
