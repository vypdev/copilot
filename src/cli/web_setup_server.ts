import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSetupBridge } from './web_setup_bridge';

const MAX_BODY_BYTES = 8192;
const MAX_ANSWER_LENGTH = 4096;
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

export interface WebSetupServer {
  readonly url: string;
  readonly pairingCode: string;
  readonly closed: Promise<void>;
  close(): Promise<void>;
}

/** Transport only: setup policy and credential decisions live behind the bridge. */
export async function startWebSetupServer(bridge: WebSetupBridge, assets = join(__dirname, '..', 'web')): Promise<WebSetupServer> {
  const sessionKey = randomBytes(32);
  const pairingCode = randomBytes(8);
  let failedPairings = 0;
  const assetRoot = await realpath(assets);
  if (!(await realpath(join(assetRoot, 'index.html'))).startsWith(`${assetRoot}${sep}`)) {
    throw new Error('Local setup index must be inside its packaged asset directory.');
  }
  const indexHtml = (await readFile(join(assetRoot, 'index.html'))).toString('utf8');
  const allowedAssets = new Set([...indexHtml.matchAll(/(?:\.\/)?(assets\/[A-Za-z0-9._-]+\.(?:js|css))/g)]
    .map(match => match[1]));
  if (allowedAssets.size < 2) throw new Error('Local setup web assets are incomplete. Reinstall Copilot or use terminal setup.');
  for (const asset of allowedAssets) {
    const packagedPath = await realpath(join(assetRoot, asset));
    if (!packagedPath.startsWith(`${assetRoot}${sep}`)) throw new Error('Local setup asset escapes its packaged directory.');
    await readFile(packagedPath);
  }
  let closeResolver: () => void = () => undefined;
  const closed = new Promise<void>(resolveClosed => { closeResolver = resolveClosed; });
  let closing = false;
  let idleTimer: NodeJS.Timeout | undefined;
  let resultTimer: NodeJS.Timeout | undefined;
  const armIdle = (): void => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!bridge.snapshot().journey?.mutationStarted && !bridge.snapshot().outcome) {
        bridge.finish('blocked', 'This local setup session expired after 30 minutes without a decision. Start a new setup run; GitHub PATs are not revoked automatically.');
      }
    }, 30 * 60 * 1000);
  };
  const server = createServer(async (request, response) => {
    const address = server.address();
    const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    const host = `127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    response.setHeader('Content-Security-Policy', CSP);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    try {
      if (request.headers.host !== host || request.headers['x-forwarded-host'] || request.headers.forwarded
        || request.headers['x-forwarded-proto'] || request.headers['sec-fetch-site'] === 'cross-site') {
        respond(response, 403, { error: 'Invalid local host or request context.' });
        return;
      }
      if (request.method === 'POST' && (request.headers.origin !== origin
        || (request.headers.referer && !request.headers.referer.startsWith(`${origin}/`)))) {
        respond(response, 403, { error: 'Invalid request origin.' });
        return;
      }
      if (request.method === 'POST' && request.url === '/api/pair') {
        if (request.headers['content-type'] !== 'application/json') { respond(response, 415, { error: 'JSON required.' }); return; }
        if (failedPairings >= 5) { respond(response, 429, { error: 'Too many pairing attempts. Restart setup.' }); return; }
        const body = await readJson(request);
        if (!matchesHexSecret(body.code, pairingCode)) {
          failedPairings += 1;
          respond(response, 403, { error: 'Incorrect pairing code. Check the terminal.' });
          return;
        }
        respond(response, 200, { sessionKey: sessionKey.toString('hex') });
        return;
      }
      if (request.url?.startsWith('/api/') && !matchesHexSecret(request.headers['x-setup-session-key'], sessionKey)) {
        respond(response, 403, { error: 'Pair this browser using the code printed by the CLI.' });
        return;
      }
      if (request.method === 'GET' && request.url === '/api/bootstrap') {
        respond(response, 200, bridge.bootstrap());
        return;
      }
      if (request.method === 'GET' && request.url === '/api/state') {
        respond(response, 200, bridge.snapshot());
        return;
      }
      if (request.method === 'POST' && request.url === '/api/takeover') {
        if (request.headers['content-type'] !== 'application/json') { respond(response, 415, { error: 'JSON required.' }); return; }
        const body = await readJson(request);
        if (failedPairings >= 5) { respond(response, 429, { error: 'Too many pairing attempts. Restart setup.' }); return; }
        if (!matchesHexSecret(body.code, pairingCode)) {
          failedPairings += 1;
          respond(response, 403, { error: 'Incorrect pairing code. Check the launching output.' });
          return;
        }
        const capability = bridge.takeOver();
        armIdle();
        respond(response, 200, { capability });
        return;
      }
      if (request.method === 'POST' && request.url === '/api/answer') {
        if (!bridge.isController(String(request.headers['x-setup-capability'] ?? ''))) { respond(response, 403, { error: 'This tab is read-only.' }); return; }
        if (request.headers['content-type'] !== 'application/json') { respond(response, 415, { error: 'JSON required.' }); return; }
        const body = await readJson(request);
        if (!Number.isSafeInteger(body.revision) || (body.revision as number) <= 0 || typeof body.value !== 'string' || body.value.length > MAX_ANSWER_LENGTH) {
          respond(response, 400, { error: 'Invalid answer.' }); return;
        }
        if (!bridge.isController(String(request.headers['x-setup-capability'] ?? ''))) {
          respond(response, 403, { error: 'Control moved to another tab.' }); return;
        }
        const accepted = bridge.answer(body.revision as number, body.value);
        const duplicate = !accepted && bridge.wasAnswered(body.revision as number);
        if (accepted) armIdle();
        respond(response, accepted || duplicate ? 200 : 409,
          accepted || duplicate ? { accepted: true, ...(duplicate ? { duplicate: true } : {}) }
            : { error: 'This question changed. Refresh the current state.' });
        return;
      }
      if (request.method === 'POST' && request.url === '/api/cancel') {
        if (!bridge.isController(String(request.headers['x-setup-capability'] ?? ''))) { respond(response, 403, { error: 'This tab is read-only.' }); return; }
        if (request.headers['content-type'] !== 'application/json') { respond(response, 415, { error: 'JSON required.' }); return; }
        await readJson(request);
        if (!bridge.isController(String(request.headers['x-setup-capability'] ?? ''))) {
          respond(response, 403, { error: 'Control moved to another tab.' }); return;
        }
        const cancelled = bridge.cancel();
        respond(response, cancelled ? 200 : 409, cancelled ? { cancelled: true } : { error: 'This setup has already started applying or ended.' });
        return;
      }
      if (request.method === 'POST' && request.url === '/api/close') {
        if (!bridge.isController(String(request.headers['x-setup-capability'] ?? '')) || !bridge.snapshot().outcome) {
          respond(response, 403, { error: 'Only the controller can close a finished session.' }); return;
        }
        if (request.headers['content-type'] !== 'application/json') { respond(response, 415, { error: 'JSON required.' }); return; }
        await readJson(request);
        if (!bridge.isController(String(request.headers['x-setup-capability'] ?? ''))) {
          respond(response, 403, { error: 'Control moved to another tab.' }); return;
        }
        respond(response, 200, { closed: true });
        setImmediate(() => void close());
        return;
      }
      if (request.method !== 'GET') { respond(response, 405, { error: 'Method not allowed.' }); return; }
      const pathname = request.url ?? '';
      if (pathname !== '/' && !/^\/assets\/[A-Za-z0-9._-]+$/.test(pathname)) {
        respond(response, 404, { error: 'Not found.' }); return;
      }
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (relative !== 'index.html' && !allowedAssets.has(relative)) {
        respond(response, 404, { error: 'Not found.' }); return;
      }
      const file = resolve(assetRoot, relative);
      const realFile = await realpath(file);
      if (!realFile.startsWith(`${assetRoot}${sep}`)) { respond(response, 404, { error: 'Not found.' }); return; }
      const content = await readFile(realFile);
      const contentType = file.endsWith('.js') ? 'text/javascript; charset=utf-8'
        : file.endsWith('.css') ? 'text/css; charset=utf-8'
          : 'text/html; charset=utf-8';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(content);
    } catch {
      if (!response.headersSent) respond(response, 400, { error: 'Invalid local request.' });
      else response.end();
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 15_000;
  server.maxRequestsPerSocket = 250;
  server.maxConnections = 16;
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolveListen(); });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to bind local setup server.');
  const url = `http://127.0.0.1:${address.port}/`;
  const close = async (): Promise<void> => {
    if (closing) return closed;
    closing = true;
    if (idleTimer) clearTimeout(idleTimer);
    if (hardTimer) clearTimeout(hardTimer);
    if (resultTimer) clearTimeout(resultTimer);
    unsubscribe?.();
    bridge.cancel();
    server.closeAllConnections();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
    closeResolver();
  };
  armIdle();
  const hardTimer = setTimeout(() => {
    if (!bridge.snapshot().journey?.mutationStarted && !bridge.snapshot().outcome) {
      bridge.finish('blocked', 'This local setup session reached its four-hour limit. Start a new run; no prior approval can be replayed.');
    }
  }, 4 * 60 * 60 * 1000);
  const unsubscribe = bridge.subscribe(view => {
    if (view.outcome && !resultTimer) resultTimer = setTimeout(() => void close(), 10 * 60 * 1000);
  });
  return { url, pairingCode: pairingCode.toString('hex'), closed, close };
}

function matchesHexSecret(value: unknown, expected: Buffer): boolean {
  return typeof value === 'string' && value.length === expected.length * 2 && /^[a-f0-9]+$/.test(value)
    && timingSafeEqual(Buffer.from(value, 'hex'), expected);
}

function respond(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('Body too large.');
    chunks.push(buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('JSON object required.');
  return parsed as Record<string, unknown>;
}

export function openWebSetupBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
  child.on('error', () => { /* The URL was already printed; manual opening remains available. */ });
  child.unref();
}
