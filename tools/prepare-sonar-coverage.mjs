import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const project of ['client', 'server']) {
  const directory = path.join(root, project, 'coverage');
  const input = await readFile(path.join(directory, 'lcov.info'), 'utf8');
  const output = input.replace(/^SF:(.+)$/gm, (_, source) => {
    const normalized = source.trim().replaceAll('\\', '/');
    const absolute = path.isAbsolute(normalized)
      ? normalized
      : path.resolve(root, project, normalized);
    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    if (relative.startsWith('../') || path.isAbsolute(relative)) {
      throw new Error(`Coverage source is outside the repository: ${source}`);
    }
    return `SF:${relative}`;
  });
  await writeFile(path.join(directory, 'sonar-lcov.info'), output, 'utf8');
  console.log(`${project}: prepared coverage/sonar-lcov.info`);
}
