import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (script) => {
  const result = spawnSync(npm, ['run', script], { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  return result.status ?? 1;
};

let status = 1;
try {
  status = run('prepare:local-aip-assets');
  if (status === 0) status = run('build');
} finally {
  const cleanupStatus = run('clean:local-aip-assets');
  process.exitCode = status || cleanupStatus;
}
