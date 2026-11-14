import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const roots = ['src', 'scripts', 'tests'];
let count = 0;
for (const root of roots) {
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const absolute = join(path, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name.endsWith('.js')) {
        const result = spawnSync(process.execPath, ['--check', absolute], { encoding: 'utf8' });
        if (result.status !== 0) {
          console.error(result.stderr);
          process.exitCode = 1;
        } else count++;
      }
    }
  };
  visit(root);
}
console.log(`${count} archivos JavaScript comprobados.`);
