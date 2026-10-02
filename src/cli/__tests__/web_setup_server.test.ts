import { mkdtempSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request, ServerResponse } from 'node:http';
import { connect, type Socket } from 'node:net';
import { WebSetupBridge } from '../web_setup_bridge';
import { startWebSetupServer, type WebSetupServer } from '../web_setup_server';

function canCreateFileSymlinks(): boolean {
  if (process.platform !== 'win32') return true;
  const probe = mkdtempSync(join(tmpdir(), 'copilot-file-symlink-probe-'));
  try {
    const target = join(probe, 'target');
    writeFileSync(target, 'fixture');
    try {
      symlinkSync(target, join(probe, 'link'), 'file');
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return false;
      throw error;
    }
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
}

const fileSymlinkTest = canCreateFileSymlinks() ? test : test.skip;

const sessionKeys = new Map<string, string>();
const registerSession = async (session: WebSetupServer): Promise<void> => {
  const origin = new URL(session.url).origin;
  const paired = await globalThis.fetch(`${session.url}api/pair`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: session.pairingCode }),
  });
  expect(paired.status).toBe(200);
  const { sessionKey } = await paired.json() as { sessionKey: string };
  sessionKeys.set(origin, sessionKey);
};
const fetch: typeof globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const headers = new Headers(init?.headers);
  if (url.pathname.startsWith('/api/')) {
    const key = sessionKeys.get(url.origin);
    if (key) headers.set('X-Setup-Session-Key', key);
  }
  return globalThis.fetch(input, { ...init, headers });
};

describe('local web setup server', () => {
  let root: string;
  let bridge: WebSetupBridge;
  let server: WebSetupServer;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'copilot-web-server-test-'));
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'index.html'), '<!doctype html><link href="./assets/app.css" rel="stylesheet"><script src="./assets/app.js"></script><title>Test setup</title>');
    writeFileSync(join(root, 'assets', 'app.js'), 'const ready = true;');
    writeFileSync(join(root, 'assets', 'app.css'), ':root { color: black; }');
    bridge = new WebSetupBridge('owner/repo');
    server = await startWebSetupServer(bridge, root);
    await registerSession(server);
  });
  afterEach(async () => { if (server) await server.close(); sessionKeys.clear(); rmSync(root, { recursive: true, force: true }); });

  const jsonPost = (url: string, path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${url}${path}`, {
    method: 'POST', headers: { Origin: url.slice(0, -1), 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });

  test('serves only bundled local files with restrictive headers', async () => {
    const page = await fetch(server.url);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(page.headers.get('access-control-allow-origin')).toBeNull();
    expect((await fetch(`${server.url}assets/app.js`)).status).toBe(200);
    const css = await fetch(`${server.url}assets/app.css`);
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8');
    writeFileSync(join(root, 'assets', 'unlisted.js'), 'alert(1)');
    expect((await fetch(`${server.url}assets/unlisted.js`)).status).toBe(404);
    expect((await fetch(`${server.url}assets/%2e%2e/index.html`)).status).toBe(404);
  });

  test('ends a response safely if an asset write fails after headers were sent', async () => {
    const end = jest.spyOn(ServerResponse.prototype, 'end').mockImplementationOnce(() => {
      throw new Error('simulated asset write failure');
    });
    try {
      const response = await fetch(server.url);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
      expect((await fetch(server.url)).status).toBe(200);
    } finally { end.mockRestore(); }
  });

  test('uses the packaged web asset location when no override is supplied', async () => {
    const filesystem = require('node:fs/promises') as typeof import('node:fs/promises');
    const original = filesystem.realpath;
    const packaged = join(__dirname, '..', '..', 'web');
    const realpath = jest.spyOn(filesystem, 'realpath').mockImplementation(async path =>
      String(path) === packaged ? original(root) : original(path));
    let defaultServer: WebSetupServer | undefined;
    try {
      defaultServer = await startWebSetupServer(new WebSetupBridge('owner/repo'));
      expect((await fetch(defaultServer.url)).status).toBe(200);
    } finally {
      if (defaultServer) await defaultServer.close();
      realpath.mockRestore();
    }
  });

  test('the public loopback URL contains no secret and API access requires terminal pairing', async () => {
    const launch = new URL(server.url);
    const key = sessionKeys.get(launch.origin)!;
    expect(launch.hash).toBe('');
    expect(launch.search).toBe('');
    expect(server.pairingCode).toMatch(/^[a-f0-9]{16}$/);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    for (const path of ['api/bootstrap', 'api/state']) {
      const missing = await globalThis.fetch(`${server.url}${path}`);
      expect(missing.status).toBe(403);
      expect(await missing.text()).not.toContain(key!);
      expect((await globalThis.fetch(`${server.url}${path}`, { headers: { 'X-Setup-Session-Key': '0'.repeat(64) } })).status).toBe(403);
    }
    expect((await globalThis.fetch(`${server.url}api/takeover`, {
      method: 'POST', headers: { Origin: launch.origin, 'Content-Type': 'application/json' }, body: '{}',
    })).status).toBe(403);
    expect(bridge.snapshot().prompt).toBeUndefined();
    expect((await fetch(`${server.url}api/bootstrap`)).status).toBe(200);
  });

  test('a key from a different local setup run cannot bootstrap this session', async () => {
    const other = await startWebSetupServer(new WebSetupBridge('owner/other'), root);
    try {
      const firstKey = sessionKeys.get(new URL(server.url).origin)!;
      await registerSession(other);
      const otherKey = sessionKeys.get(new URL(other.url).origin)!;
      expect(otherKey).not.toBe(firstKey);
      expect((await globalThis.fetch(`${other.url}api/bootstrap`, {
        headers: { 'X-Setup-Session-Key': firstKey },
      })).status).toBe(403);
      expect((await globalThis.fetch(`${other.url}api/bootstrap`, {
        headers: { 'X-Setup-Session-Key': otherKey },
      })).status).toBe(200);
    } finally { await other.close(); }
  });

  test('pairing rejects missing, cross-origin, and incorrect codes without exposing the session key', async () => {
    const endpoint = `${server.url}api/pair`;
    const origin = new URL(server.url).origin;
    const post = (code: unknown, requestOrigin = origin) => globalThis.fetch(endpoint, {
      method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    });
    expect((await post(server.pairingCode, 'https://evil.example')).status).toBe(403);
    expect((await post(undefined)).status).toBe(403);
    const wrong = await post('0'.repeat(16));
    expect(wrong.status).toBe(403);
    expect(await wrong.text()).not.toContain(sessionKeys.get(origin)!);
    expect((await post(server.pairingCode)).status).toBe(200);
  });

  test('pairing requires JSON even for a valid code', async () => {
    const response = await globalThis.fetch(`${server.url}api/pair`, {
      method: 'POST',
      headers: { Origin: new URL(server.url).origin, 'Content-Type': 'text/plain' },
      body: JSON.stringify({ code: server.pairingCode }),
    });
    expect(response.status).toBe(415);
    expect(await response.text()).not.toContain(sessionKeys.get(new URL(server.url).origin)!);
  });

  test('five incorrect pairing attempts cause a recoverable cooldown, not a permanent lockout', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    try {
      const endpoint = `${server.url}api/pair`;
      const origin = new URL(server.url).origin;
      const post = (code: string) => globalThis.fetch(endpoint, {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
      });
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await post('0'.repeat(16))).status).toBe(403);
      }
      const locked = await post(server.pairingCode);
      expect(locked.status).toBe(429);
      expect(await locked.clone().text()).toContain('Wait 30 seconds');
      expect(await locked.text()).not.toContain(sessionKeys.get(origin)!);
      expect((await fetch(`${server.url}api/bootstrap`)).status).toBe(200);
      now.mockReturnValue(130_001);
      expect((await post(server.pairingCode)).status).toBe(200);
    } finally { now.mockRestore(); }
  });

  test('a correct pairing resets prior wrong-code attempts', async () => {
    const endpoint = `${server.url}api/pair`;
    const origin = new URL(server.url).origin;
    const post = (code: string) => globalThis.fetch(endpoint, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    });
    for (let attempt = 0; attempt < 4; attempt += 1) expect((await post('0'.repeat(16))).status).toBe(403);
    expect((await post(server.pairingCode)).status).toBe(200);
    for (let attempt = 0; attempt < 4; attempt += 1) expect((await post('0'.repeat(16))).status).toBe(403);
    expect((await post(server.pairingCode)).status).toBe(200);
  });

  test('bounds simultaneous loopback connections', async () => {
    const { port } = new URL(server.url);
    const sockets: Socket[] = [];
    const open = () => new Promise<Socket>((resolveSocket, reject) => {
      const socket = connect(Number(port), '127.0.0.1');
      socket.once('connect', () => resolveSocket(socket));
      socket.once('error', reject);
    });
    try {
      sockets.push(...await Promise.all(Array.from({ length: 16 }, open)));
      const overflow = await open();
      sockets.push(overflow);
      await expect(new Promise<void>((resolveClose, reject) => {
        const timeout = setTimeout(() => reject(new Error('Excess connection was not closed.')), 1000);
        overflow.once('close', () => { clearTimeout(timeout); resolveClose(); });
      })).resolves.toBeUndefined();
    } finally { for (const socket of sockets) socket.destroy(); }
  });

  test('rejects forged hosts and cross-origin mutation', async () => {
    const forgedStatus = await new Promise<number>((resolveStatus, reject) => {
      const forged = request(server.url, { headers: { Host: 'evil.example' } }, response => {
        response.resume(); resolveStatus(response.statusCode ?? 0);
      });
      forged.on('error', reject); forged.end();
    });
    expect(forgedStatus).toBe(403);
    const boot = await (await fetch(`${server.url}api/bootstrap`)).json() as { capability: string };
    const pending = bridge.ask({ kind: 'secret', title: 'PAT' });
    const revision = bridge.snapshot().promptRevision!;
    expect((await jsonPost(server.url, 'api/answer', { revision, value: 'sensitive' }, {
      Origin: 'https://evil.example', 'X-Setup-Capability': boot.capability,
    })).status).toBe(403);
    expect((await jsonPost(server.url, 'api/answer', { revision, value: 'sensitive' }, {
      'X-Setup-Capability': 'wrong',
    })).status).toBe(403);
    expect(bridge.answer(revision, 'allowed')).toBe(true);
    expect(await pending).toBe('allowed');
  });

  test('accepts one authorized answer and never returns the submitted PAT', async () => {
    const boot = await (await fetch(`${server.url}api/bootstrap`)).json() as { capability: string };
    const pending = bridge.ask({ kind: 'secret', title: 'Setup PAT' });
    const revision = bridge.snapshot().promptRevision!;
    const response = await jsonPost(server.url, 'api/answer', { revision, value: 'ghp_private' }, { 'X-Setup-Capability': boot.capability });
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('ghp_private');
    expect(await pending).toBe('ghp_private');
    const duplicate = await jsonPost(server.url, 'api/answer', { revision, value: 'again' }, { 'X-Setup-Capability': boot.capability });
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ accepted: true, duplicate: true });
    expect((await jsonPost(server.url, 'api/answer', { revision: revision + 1, value: 'again' }, { 'X-Setup-Capability': boot.capability })).status).toBe(409);
    expect(await (await fetch(`${server.url}api/state`)).text()).not.toContain('ghp_private');
  });

  test('allows only the paired controller to explicitly retry the current discovery revision', async () => {
    const boot = await (await fetch(`${server.url}api/bootstrap`)).json() as { capability: string };
    const commit = jest.fn();
    const pending = bridge.ask({ kind: 'text', title: 'Checks' }, async () => ({
      prompt: { kind: 'text', title: 'Checks refreshed' }, commit,
    }));
    const revision = bridge.snapshot().promptRevision!;
    expect((await jsonPost(server.url, 'api/retry-discovery', { revision }, { 'X-Setup-Capability': 'wrong' })).status).toBe(403);
    expect((await jsonPost(server.url, 'api/retry-discovery', { revision: 'bad' }, { 'X-Setup-Capability': boot.capability })).status).toBe(400);
    expect((await jsonPost(server.url, 'api/retry-discovery', { revision: revision + 1 }, { 'X-Setup-Capability': boot.capability })).status).toBe(409);
    const response = await jsonPost(server.url, 'api/retry-discovery', { revision }, { 'X-Setup-Capability': boot.capability });
    expect(response.status).toBe(200);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(bridge.snapshot().promptRevision).toBe(revision);
    expect(bridge.snapshot().prompt?.title).toBe('Checks refreshed');
    expect((await jsonPost(server.url, 'api/answer', { revision, value: 'selected' }, { 'X-Setup-Capability': boot.capability })).status).toBe(200);
    expect(await pending).toBe('selected');
  });

  test('authorizes back navigation by revision without replaying the entire setup session', async () => {
    const boot = await (await fetch(`${server.url}api/bootstrap`)).json() as { capability: string };
    const commit = jest.fn();
    const pending = bridge.ask({ kind: 'text', title: 'Current question' }, undefined, () => ({
      prompt: { kind: 'text', title: 'Previous question' }, commit,
    }));
    const revision = bridge.snapshot().promptRevision!;
    expect((await jsonPost(server.url, 'api/back', { revision }, { 'X-Setup-Capability': 'wrong' })).status).toBe(403);
    expect((await fetch(`${server.url}api/back`, { method: 'POST', headers: {
      Origin: server.url.slice(0, -1), 'Content-Type': 'text/plain', 'X-Setup-Capability': boot.capability,
    }, body: '{}' })).status).toBe(415);
    expect((await jsonPost(server.url, 'api/back', { revision: 'invalid' }, { 'X-Setup-Capability': boot.capability })).status).toBe(400);
    expect((await jsonPost(server.url, 'api/back', { revision: revision + 1 }, { 'X-Setup-Capability': boot.capability })).status).toBe(409);
    expect((await jsonPost(server.url, 'api/back', { revision }, { 'X-Setup-Capability': boot.capability })).status).toBe(200);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(bridge.snapshot().prompt?.title).toBe('Previous question');
    expect((await jsonPost(server.url, 'api/back', { revision }, { 'X-Setup-Capability': boot.capability })).status).toBe(409);
    expect((await jsonPost(server.url, 'api/answer', { revision: bridge.snapshot().promptRevision, value: 'answer' },
      { 'X-Setup-Capability': boot.capability })).status).toBe(200);
    expect(await pending).toBe('answer');
  });

  test('rejects oversized answers, wrong method, and unsupported content type', async () => {
    const boot = await (await fetch(`${server.url}api/bootstrap`)).json() as { capability: string };
    const pending = bridge.ask({ kind: 'text', title: 'Answer' });
    const revision = bridge.snapshot().promptRevision!;
    expect((await jsonPost(server.url, 'api/answer', { revision, value: 'x'.repeat(5000) }, { 'X-Setup-Capability': boot.capability })).status).toBe(400);
    expect((await fetch(`${server.url}api/answer`)).status).toBe(404);
    expect((await fetch(`${server.url}api/answer`, { method: 'POST', headers: { Origin: server.url.slice(0, -1), 'Content-Type': 'text/plain', 'X-Setup-Capability': boot.capability }, body: '{}' })).status).toBe(415);
    bridge.cancel();
    await pending;
  });

  test('a second tab explicitly takes over and invalidates the first tab capability', async () => {
    const first = await (await fetch(`${server.url}api/bootstrap`)).json() as { capability: string };
    const second = await (await fetch(`${server.url}api/bootstrap`)).json() as { controller: boolean; capability?: string; takeoverTicket?: string };
    expect(second.controller).toBe(false);
    expect(second.capability).toBeUndefined();
    expect(second.takeoverTicket).toBeUndefined();
    expect((await jsonPost(server.url, 'api/takeover', { code: 'wrong' })).status).toBe(403);
    const takeover = await jsonPost(server.url, 'api/takeover', { code: server.pairingCode });
    expect(takeover.status).toBe(200);
    const { capability } = await takeover.json() as { capability: string };
    const pending = bridge.ask({ kind: 'choice', title: 'Proceed?', choices: ['yes', 'no'] });
    const revision = bridge.snapshot().promptRevision;
    expect((await jsonPost(server.url, 'api/answer', { revision, value: 'yes' }, { 'X-Setup-Capability': first.capability })).status).toBe(403);
    expect((await jsonPost(server.url, 'api/answer', { revision, value: 'yes' }, { 'X-Setup-Capability': capability })).status).toBe(200);
    expect(await pending).toBe('yes');
  });

  test('limits wrong-code takeover attempts temporarily without returning a controller capability', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    try {
      await fetch(`${server.url}api/bootstrap`);
      await fetch(`${server.url}api/bootstrap`);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const rejected = await jsonPost(server.url, 'api/takeover', { code: 'wrong' });
        expect(rejected.status).toBe(403);
        expect(await rejected.json()).not.toHaveProperty('capability');
      }
      expect((await jsonPost(server.url, 'api/takeover', { code: server.pairingCode })).status).toBe(429);
      now.mockReturnValue(130_001);
      expect((await jsonPost(server.url, 'api/takeover', { code: server.pairingCode })).status).toBe(200);
    } finally { now.mockRestore(); }
  });

  test('cancel requires the controller and never claims to cancel in-flight Apply', async () => {
    const { capability } = await (await fetch(`${server.url}api/bootstrap`)).json() as { capability: string };
    const pending = bridge.ask({ kind: 'text', title: 'Answer' });
    expect((await jsonPost(server.url, 'api/cancel', {}, { 'X-Setup-Capability': 'wrong' })).status).toBe(403);
    expect((await jsonPost(server.url, 'api/cancel', {}, { 'X-Setup-Capability': capability })).status).toBe(200);
    expect(await pending).toBeUndefined();
    expect(bridge.snapshot().outcome).toBe('cancelled');

    const secondBridge = new WebSetupBridge('owner/repo');
    const secondServer = await startWebSetupServer(secondBridge, root);
    await registerSession(secondServer);
    try {
      const nextCapability = (await (await fetch(`${secondServer.url}api/bootstrap`)).json() as { capability: string }).capability;
      secondBridge.setJourney({ repository: 'owner/repo', position: 6, total: 6, current: 'Apply', complete: [], pending: [], mutationStarted: true, choiceReviewPass: 1 });
      expect((await jsonPost(secondServer.url, 'api/cancel', {}, { 'X-Setup-Capability': nextCapability })).status).toBe(409);
      expect(secondBridge.snapshot().outcome).toBeUndefined();
    } finally { await secondServer.close(); }
  });

  test('close is rejected before a result and succeeds for the finished controller', async () => {
    const { capability } = await (await fetch(`${server.url}api/bootstrap`)).json() as { capability: string };
    expect((await jsonPost(server.url, 'api/close', {}, { 'X-Setup-Capability': capability })).status).toBe(403);
    bridge.finish('complete', 'done');
    expect((await jsonPost(server.url, 'api/close', {}, { 'X-Setup-Capability': 'wrong' })).status).toBe(403);
    expect((await jsonPost(server.url, 'api/close', {}, { 'X-Setup-Capability': capability })).status).toBe(200);
    await server.closed;
  });

  test('post-success read-only verification requires the controller and returns only redacted counts', async () => {
    const { capability } = await (await fetch(`${server.url}api/bootstrap`)).json() as { capability: string };
    const run = jest.fn().mockResolvedValue({ healthy: false, pass: 4, warn: 1, fail: 0, skipped: 2,
      secret: 'must-not-appear' });
    bridge.configureReadOnlyDoctor(run);
    expect((await jsonPost(server.url, 'api/doctor', {}, { 'X-Setup-Capability': capability })).status).toBe(409);
    bridge.finish('complete', 'done');
    expect((await jsonPost(server.url, 'api/doctor', {}, { 'X-Setup-Capability': 'wrong' })).status).toBe(403);
    expect((await jsonPost(server.url, 'api/doctor', {}, { 'X-Setup-Capability': capability })).status).toBe(200);
    const state = await (await fetch(`${server.url}api/state`)).text();
    expect(state).toContain('"warn":1');
    expect(state).not.toContain('must-not-appear');
    expect((await jsonPost(server.url, 'api/doctor', {}, { 'X-Setup-Capability': capability })).status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test.each([
    [{ 'X-Forwarded-Host': 'evil.example' }, 403],
    [{ 'X-Forwarded-Proto': 'https' }, 403],
    [{ Forwarded: 'host=evil.example' }, 403],
    [{ 'Sec-Fetch-Site': 'cross-site' }, 403],
  ])('rejects proxy or cross-site context %j', async (headers, expected) => {
    expect((await fetch(server.url, { headers })).status).toBe(expected);
  });

  test('rejects foreign Referer, malformed JSON and wrong API methods', async () => {
    const { capability } = await (await fetch(`${server.url}api/bootstrap`)).json() as { capability: string };
    expect((await jsonPost(server.url, 'api/answer', { revision: 1, value: 'x' }, {
      Referer: 'https://evil.example/', 'X-Setup-Capability': capability,
    })).status).toBe(403);
    expect((await fetch(`${server.url}api/state`, { method: 'POST', headers: { Origin: server.url.slice(0, -1), 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(405);
    expect((await fetch(`${server.url}api/answer`, {
      method: 'POST', headers: { Origin: server.url.slice(0, -1), 'Content-Type': 'application/json', 'X-Setup-Capability': capability }, body: '{invalid',
    })).status).toBe(400);
    expect((await fetch(`${server.url}api/not-a-route`)).status).toBe(404);
  });

  test('rejects invalid payload types and bodies beyond the byte limit', async () => {
    const { capability } = await (await fetch(`${server.url}api/bootstrap`)).json() as { capability: string };
    const pending = bridge.ask({ kind: 'secret', title: 'PAT' });
    const revision = bridge.snapshot().promptRevision;
    for (const invalid of [{ revision: '1', value: 'x' }, { revision, value: 7 }, { revision: -1, value: 'x' }]) {
      expect((await jsonPost(server.url, 'api/answer', invalid, { 'X-Setup-Capability': capability })).status).toBe(400);
    }
    expect((await jsonPost(server.url, 'api/answer', [], { 'X-Setup-Capability': capability })).status).toBe(400);
    expect((await jsonPost(server.url, 'api/answer', { revision, value: 'x'.repeat(8500) }, { 'X-Setup-Capability': capability })).status).toBe(400);
    bridge.cancel();
    await pending;
  });

  fileSymlinkTest('startup refuses missing or symlinked packaged assets', async () => {
    const invalid = mkdtempSync(join(tmpdir(), 'copilot-web-assets-test-'));
    try {
      writeFileSync(join(invalid, 'index.html'), '<title>No assets</title>');
      await expect(startWebSetupServer(new WebSetupBridge('owner/repo'), invalid)).rejects.toThrow('incomplete');
      mkdirSync(join(invalid, 'assets'));
      writeFileSync(join(invalid, 'index.html'), '<link href="./assets/app.css"><script src="./assets/app.js"></script>');
      writeFileSync(join(invalid, 'assets/app.css'), 'body {}');
      symlinkSync(join(root, 'assets/app.js'), join(invalid, 'assets/app.js'));
      await expect(startWebSetupServer(new WebSetupBridge('owner/repo'), invalid)).rejects.toThrow('escapes');
    } finally { rmSync(invalid, { recursive: true, force: true }); }
  });

  fileSymlinkTest('startup refuses an index symlink outside the asset root', async () => {
    const invalid = mkdtempSync(join(tmpdir(), 'copilot-web-index-test-'));
    try {
      symlinkSync(join(root, 'index.html'), join(invalid, 'index.html'));
      await expect(startWebSetupServer(new WebSetupBridge('owner/repo'), invalid)).rejects.toThrow('index must be inside');
    } finally { rmSync(invalid, { recursive: true, force: true }); }
  });

  fileSymlinkTest('an asset replaced by an escaping symlink is not served', async () => {
    unlinkSync(join(root, 'assets', 'app.js'));
    const outside = mkdtempSync(join(tmpdir(), 'copilot-asset-escape-test-'));
    try {
      writeFileSync(join(outside, 'app.js'), 'alert(1)');
      symlinkSync(join(outside, 'app.js'), join(root, 'assets', 'app.js'));
      expect((await fetch(`${server.url}assets/app.js`)).status).toBe(404);
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });

  test('all mutating endpoints require an exact JSON content type', async () => {
    const { capability } = await (await fetch(`${server.url}api/bootstrap`)).json() as { capability: string };
    const wrongType = (path: string) => fetch(`${server.url}${path}`, {
      method: 'POST', headers: { Origin: server.url.slice(0, -1), 'Content-Type': 'text/plain', 'X-Setup-Capability': capability }, body: '{}',
    });
    expect((await wrongType('api/takeover')).status).toBe(415);
    expect((await wrongType('api/cancel')).status).toBe(415);
    bridge.finish('complete', 'done');
    expect((await wrongType('api/close')).status).toBe(415);
    expect((await wrongType('api/doctor')).status).toBe(415);
  });

  test('mutating requests without a controller capability do nothing', async () => {
    const origin = server.url.slice(0, -1);
    const pending = bridge.ask({ kind: 'secret', title: 'PAT' });
    const revision = bridge.snapshot().promptRevision;
    expect((await jsonPost(server.url, 'api/answer', { revision, value: 'ignored' })).status).toBe(403);
    expect((await jsonPost(server.url, 'api/cancel', {})).status).toBe(403);
    expect((await jsonPost(server.url, 'api/doctor', {})).status).toBe(403);
    expect((await jsonPost(server.url, 'api/takeover', { code: 42 })).status).toBe(403);
    expect((await fetch(`${server.url}api/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, value: 'ignored' }) })).status).toBe(403);
    expect(origin).toContain('127.0.0.1');
    bridge.cancel();
    await pending;
  });

  test.each(['api/answer', 'api/cancel', 'api/close'])('rejects control transferred while reading %s', async path => {
    const { capability } = await (await fetch(`${server.url}api/bootstrap`)).json() as { capability: string };
    if (path === 'api/answer') void bridge.ask({ kind: 'secret', title: 'PAT' });
    if (path === 'api/close') bridge.finish('complete', 'done');
    const controller = jest.spyOn(bridge, 'isController').mockReturnValueOnce(true).mockReturnValueOnce(false);
    try {
      const response = await jsonPost(server.url, path, path === 'api/answer'
        ? { revision: bridge.snapshot().promptRevision, value: 'unaccepted' } : {}, { 'X-Setup-Capability': capability });
      expect(response.status).toBe(403);
      if (path === 'api/answer') expect(bridge.snapshot().prompt?.kind).toBe('secret');
    } finally {
      controller.mockRestore();
      if (path === 'api/answer') bridge.cancel();
    }
  });

  test('an unanswered pre-Apply prompt expires without accepting a late answer', async () => {
    await server.close();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      bridge = new WebSetupBridge('owner/repo');
      server = await startWebSetupServer(bridge, root);
      await registerSession(server);
      const pending = bridge.ask({ kind: 'secret', title: 'Setup PAT' });
      const revision = bridge.snapshot().promptRevision!;
      await jest.advanceTimersByTimeAsync(30 * 60 * 1000);
      expect(bridge.snapshot().outcome).toBe('blocked');
      expect(await pending).toBeUndefined();
      expect(bridge.answer(revision, 'late-token')).toBe(false);
      expect(JSON.stringify(bridge.snapshot())).not.toContain('late-token');
    } finally {
      await server.close();
      jest.useRealTimers();
    }
  });

  test('the idle limit does not interrupt a mutation already in progress', async () => {
    await server.close();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      bridge = new WebSetupBridge('owner/repo');
      server = await startWebSetupServer(bridge, root);
      await registerSession(server);
      bridge.setJourney({ repository: 'owner/repo', position: 6, total: 6, current: 'Apply',
        complete: [], pending: [], mutationStarted: true, choiceReviewPass: 1 });
      await jest.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
      expect(bridge.snapshot().outcome).toBeUndefined();
    } finally {
      await server.close();
      jest.useRealTimers();
    }
  });

  test('the absolute lifetime expires a pre-Apply session even after an earlier active interval', async () => {
    await server.close();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      bridge = new WebSetupBridge('owner/repo');
      server = await startWebSetupServer(bridge, root);
      await registerSession(server);
      const applying = { repository: 'owner/repo', position: 6, total: 6, current: 'Apply',
        complete: [] as string[], pending: [] as string[], mutationStarted: true, choiceReviewPass: 1 };
      bridge.setJourney(applying);
      await jest.advanceTimersByTimeAsync(30 * 60 * 1000);
      bridge.setJourney({ ...applying, mutationStarted: false });
      await jest.advanceTimersByTimeAsync(3.5 * 60 * 60 * 1000);
      expect(bridge.snapshot().outcome).toBe('blocked');
      expect(bridge.snapshot().message?.text).toContain('four-hour limit');
    } finally {
      await server.close();
      jest.useRealTimers();
    }
  });

  test('a finished session closes itself after its result-reading window', async () => {
    await server.close();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      bridge = new WebSetupBridge('owner/repo');
      server = await startWebSetupServer(bridge, root);
      await registerSession(server);
      bridge.finish('complete', 'done');
      await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
      await expect(server.closed).resolves.toBeUndefined();
    } finally {
      await server.close();
      jest.useRealTimers();
    }
  });
});
