import { spawnSync } from 'node:child_process';
import path from 'node:path';

const seedScript = path.join(process.cwd(), 'backend', 'scripts', 'seed.js');
const result = spawnSync(process.execPath, [seedScript], {
  stdio: 'inherit',
  cwd: path.join(process.cwd(), 'backend'),
  env: process.env,
});

process.exit(result.status ?? 1);
