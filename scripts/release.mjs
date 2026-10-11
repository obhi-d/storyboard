#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = process.argv[2] || `v${version}`;
if (tag !== `v${version}`) throw new Error(`Release tag must match package.json: v${version}`);
function run(args) {
  const result = spawnSync('gh', args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run([
  'workflow',
  'run',
  'release.yml',
  '--repo',
  'obhi-d/storyboard',
  '--ref',
  'main',
  '-f',
  `tag=${tag}`,
]);
console.log(
  'Release workflow started. Both desktop builds and smoke tests must pass before publication.',
);
run(['run', 'list', '--repo', 'obhi-d/storyboard', '--workflow', 'release.yml', '--limit', '3']);
