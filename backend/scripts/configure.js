import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { buildConfiguration, verifyDatabase, verifySmtp } from './configuration.js';

// Local operator utility only. This server is never mounted on the hosted API.
const host = '127.0.0.1';
const port = Number(process.env.POSTROOM_SETUP_PORT || 5101);
const origin = `http://${host}:${port}`;
const csrf = randomBytes(32).toString('hex');
const root = fileURLToPath(new URL('../../', import.meta.url));
const team = 'team_eQfBQ4Yei1mrCkER422Lzwti';
const project = 'prj_OYKsvSrJUNBs8TTJC1bzdTO8g2aa';
const site = 'https://bulk-mail-app-tau.vercel.app';
const assets = new URL('./setup/', import.meta.url);
let busy = false;

function cliLocation() {
  const candidates = process.platform === 'win32'
    ? [path.join(process.env.APPDATA || '', 'npm/node_modules/vercel/dist/vc.js')]
    : (process.env.PATH || '').split(path.delimiter).map((entry) => path.join(entry, 'vercel'));
  const candidate = candidates.find((file) => existsSync(file));
  if (!candidate) throw new Error('Install the Vercel CLI and run vercel login before publishing.');
  return candidate;
}

function vercel(args, input = '') {
  return new Promise((resolve, reject) => {
    const cli = cliLocation();
    const child = process.platform === 'win32'
      ? spawn(process.execPath, [cli, ...args, '--scope', team], {
          cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' },
        })
      : spawn(cli, [...args, '--scope', team], {
          cwd: root, stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' },
        });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Vercel took too long. Check the deployment dashboard before retrying.')); }, 300000);
    // Consume and discard CLI output: it must never be echoed to the browser or logs.
    child.stdout.resume();
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.once('error', () => { clearTimeout(timeout); reject(new Error('Cannot start the Vercel CLI.')); });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error('Vercel could not complete the request. Check CLI sign-in and your project dashboard.'));
    });
    child.stdin.end(input);
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  if (req.headers.host !== `${host}:${port}`) return json(res, 403, { message: 'Open the local setup URL printed in your terminal.' });
  if (req.method === 'GET') {
    const allowed = { '/': ['index.html', 'text/html'], '/setup.js': ['setup.js', 'text/javascript'], '/setup.css': ['setup.css', 'text/css'] };
    const asset = allowed[req.url];
    if (!asset) return json(res, 404, { message: 'Not found.' });
    try {
      const source = await readFile(new URL(asset[0], assets), 'utf8');
      res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` });
      res.end(asset[0] === 'index.html' ? source.replace('SETUP_CSRF_TOKEN', csrf) : source);
    } catch { json(res, 500, { message: 'The setup page could not be loaded.' }); }
    return;
  }
  if (req.method !== 'POST' || req.url !== '/configure') return json(res, 404, { message: 'Not found.' });
  if (req.headers.origin !== origin || req.headers['x-setup-token'] !== csrf || req.headers['content-type'] !== 'application/json')
    return json(res, 403, { message: 'Reload the local setup page before continuing.' });
  if (busy) return json(res, 409, { message: 'A connection check or deployment is already running.' });
  busy = true;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16000) { json(res, 413, { message: 'Request too large.' }); return; }
      chunks.push(chunk);
    }
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return json(res, 400, { message: 'Invalid form data.' }); }
    if (!input || !['database', 'verify', 'deploy'].includes(input.action))
      return json(res, 400, { message: 'Choose a setup action.' });
    const values = buildConfiguration(input, { includeSmtp: input.action !== 'database' });
    await verifyDatabase(values.MONGODB_URI);
    if (input.action === 'database') return json(res, 200, { message: 'MongoDB login, indexes, and read/write permissions verified. No email was sent.' });
    await verifySmtp(values);
    if (input.action === 'verify') return json(res, 200, { message: 'MongoDB and SMTP login verified. No email was sent. You can now save and deploy.' });
    await vercel(['whoami']);
    for (const [key, value] of Object.entries(values)) {
      try {
        await vercel(['env', 'add', key, '--project', project, '--environment', 'production,preview', '--sensitive', '--force', '--yes'], value);
      } catch {
        throw new Error(`Could not save ${key} in Vercel. Some settings may have been saved; deployment has not been started. Check Vercel sign-in, then retry.`);
      }
    }
    await vercel(['redeploy', site, '--environment', 'production']);
    json(res, 200, { message: 'Both connections verified, secrets saved to Vercel, and deployment completed. Open the app and send a campaign to an address you own to confirm delivery.', url: site, deployed: true });
  } catch (error) {
    // Errors thrown by verification and CLI wrappers contain fixed text, never provider details.
    json(res, 400, { message: error.message });
  } finally { busy = false; }
});

server.listen(port, host, () => {
  console.log(`Private Postroom setup: ${origin}`);
  console.log('Enter credentials only on this local page. They are not written to files or printed in logs.');
});
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? 'The setup port is already in use. Reuse the existing local setup page.' : 'Could not start local setup.');
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
