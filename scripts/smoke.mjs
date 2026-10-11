import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const executable = process.argv[2];
if (!executable) throw new Error('Pass a packaged executable path');
const child = spawnSync(resolve(executable), ['--smoke-test'], {
  stdio: 'inherit',
  timeout: 60000,
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
});
if (child.error) console.error(child.error);
process.exit(child.status ?? 1);
