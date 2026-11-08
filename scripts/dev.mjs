import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const services = [
  { directory: 'backend', args: ['--watch', 'src/server.js'] },
  { directory: 'frontend', args: ['node_modules/vite/bin/vite.js'] },
];
const children = services.map(({ directory, args }) =>
  spawn(process.execPath, args, {
    cwd: fileURLToPath(new URL(`../${directory}/`, import.meta.url)),
    stdio: 'inherit',
  }),
);

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else child.kill('SIGTERM');
  }
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code || 0);
  });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
