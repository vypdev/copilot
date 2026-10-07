#!/usr/bin/env node
/** Read-only browser review fixture. No repository, token or GitHub adapter is loaded. */
const { createServer } = require('node:http');
const { readFileSync, realpathSync } = require('node:fs');
const { join, sep } = require('node:path');
const { reviewView } = require('./web-setup-review-views.cjs');

const states = new Set(['pending', 'action-required', 'blocked', 'partial', 'completed', 'cancelled', 'expired',
  'plan', 'checks', 'question', 'credential', 'blocked-permissions', 'bot-credential', 'bot-account-mismatch']);
const selected = process.argv[2];
if (!states.has(selected)) {
  console.error(`Choose one fixture state: ${[...states].join(', ')}`);
  process.exit(2);
}
const assetRoot = realpathSync(join(__dirname, '..', 'build', 'web'));
const html = readFileSync(join(assetRoot, 'index.html'));
const assets = new Set([...html.toString().matchAll(/(?:\.\/)?(assets\/[A-Za-z0-9._-]+\.(?:js|css))/g)].map(match => `/${match[1]}`));
if (assets.size < 2) throw new Error('Build the web assets before reviewing fixtures.');
const code = '0123456789abcdef'; // A public fixture value, never a real setup credential.
const key = 'f'.repeat(64);

function view() {
  const review = reviewView(selected);
  if (review) return review;
  const terminal = !['pending', 'action-required'].includes(selected);
  const outcome = selected === 'completed' ? 'complete' : selected === 'expired' || selected === 'blocked'
    ? 'blocked' : selected === 'partial' ? 'partial' : selected === 'cancelled' ? 'cancelled' : undefined;
  const mutationStarted = selected === 'partial' || selected === 'completed';
  const current = selected === 'pending' ? 'Plan' : 'Apply';
  const effects = mutationStarted ? [
    { id: 'files', state: 'completed', scope: 'local' },
    { id: 'secrets', state: selected === 'partial' ? 'needs-inspection' : 'completed', scope: 'repository' },
    { id: 'labels', state: selected === 'partial' ? 'not-started' : 'skipped', scope: 'repository' },
  ] : undefined;
  return {
    revision: 1, repository: 'fixture-owner/fixture-repo',
    journey: { repository: 'fixture-owner/fixture-repo', position: selected === 'pending' ? 4 : 6,
      total: 6, current, complete: ['Repository', 'Setup choices', 'Setup PAT'], pending: [],
      mutationStarted, choiceReviewPass: 1, ...(outcome ? { outcome } : {}) },
    ...(selected === 'action-required' ? { promptRevision: 1, prompt: {
      kind: 'confirm', title: 'Apply this setup now?', copyId: 'apply.confirm',
      choices: ['Apply setup', 'Stop without applying'],
    } } : {}),
    ...(terminal ? { outcome, resultDetail: {
      reasonCode: selected === 'expired' ? 'session-expired' : selected === 'cancelled' ? 'cancelled'
        : selected === 'blocked' ? 'permissions' : 'unknown',
      stoppedStage: current, mutationStarted, ...(effects ? { effects } : {}),
    } } : {}),
  };
}

function reply(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  const address = server.address();
  const host = `127.0.0.1:${address.port}`;
  if (request.headers.host !== host) return reply(response, 403, { error: 'Local fixture only.' });
  if (request.method === 'GET' && request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
    return;
  }
  if (request.method === 'GET' && assets.has(request.url)) {
    const file = realpathSync(join(assetRoot, request.url.slice(1)));
    if (!file.startsWith(`${assetRoot}${sep}`)) return reply(response, 403, { error: 'Invalid asset.' });
    response.writeHead(200, { 'Content-Type': file.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control': 'no-store' });
    response.end(readFileSync(file));
    return;
  }
  if (request.method === 'POST' && request.url === '/api/pair') {
    if (request.headers.origin !== `http://${host}`) return reply(response, 403, { error: 'Invalid origin.' });
    let body = '';
    request.on('data', chunk => { body += chunk; if (body.length > 1024) request.destroy(); });
    request.on('end', () => {
      try { return reply(response, JSON.parse(body).code === code ? 200 : 403,
        JSON.parse(body).code === code ? { sessionKey: key } : { error: 'Use the fixture code printed in the terminal.' }); }
      catch { return reply(response, 400, { error: 'Invalid fixture request.' }); }
    });
    return;
  }
  if (request.headers['x-setup-session-key'] !== key) return reply(response, 403, { error: 'Pair the fixture browser.' });
  if (request.method === 'GET' && request.url === '/api/bootstrap') return reply(response, 200, { controller: true, capability: 'e'.repeat(64) });
  if (request.method === 'GET' && request.url === '/api/state') return reply(response, 200, view());
  reply(response, 409, { error: 'Read-only review fixture; no setup action is available.' });
});
server.listen(0, '127.0.0.1', () => {
  console.log(`Read-only ${selected} fixture: http://127.0.0.1:${server.address().port}/`);
  console.log(`Fixture pairing code: ${code}`);
  console.log('Press Ctrl+C to stop. This server cannot run setup.');
});
