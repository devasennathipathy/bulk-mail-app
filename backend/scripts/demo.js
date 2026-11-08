import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startMongo } from './mongo.js';

console.info(
  'Starting your local demo database. The first run downloads MongoDB; later runs reuse it.',
);
const mongo = await startMongo({ persistent: true });
const root = fileURLToPath(new URL('../../', import.meta.url));
console.info(
  'Demo database ready. Records are kept in backend/.data/mongodb. Real email is disabled.',
);
const child = spawn(process.execPath, ['scripts/dev.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, MONGODB_URI: mongo.getUri('postroom'), MAIL_MODE: 'preview' },
});
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (process.platform === 'win32' && child.pid) {
    const task = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    await new Promise((resolve) => task.on('exit', resolve));
  } else child.kill('SIGTERM');
  await mongo.stop();
  process.exitCode = code;
}
child.on('error', (error) => {
  console.error(error.message);
  stop(1);
});
child.on('exit', (code) => stop(code || 0));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
