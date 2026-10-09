const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function fixtureGit(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function createFixtureRepository(root) {
  fs.mkdirSync(root);
  fixtureGit(root, 'init', '-q');
  fixtureGit(root, 'checkout', '-q', '-b', 'develop');
  fixtureGit(root, 'config', 'user.name', 'Package Smoke');
  fixtureGit(root, 'config', 'user.email', 'package-smoke@example.test');
  fixtureGit(root, 'remote', 'add', 'origin', 'https://github.com/fixture/setup-smoke.git');
  fs.writeFileSync(path.join(root, 'README.md'), '# Isolated setup fixture\n');
  fixtureGit(root, 'add', 'README.md');
  const emptyHooks = path.join(root, '.git', 'empty-hooks');
  fs.mkdirSync(emptyHooks);
  fixtureGit(root, '-c', `core.hooksPath=${emptyHooks}`, 'commit', '-qm', 'fixture');
}

function suppressBrowserOpener(directory) {
  const preload = path.join(directory, 'no-browser-opener.cjs');
  fs.writeFileSync(preload, [
    "const childProcess = require('node:child_process');",
    "const { EventEmitter } = require('node:events');",
    'const original = childProcess.spawn;',
    'childProcess.spawn = function(command, args, options) {',
    "  if (['open', 'xdg-open', 'cmd'].includes(command) && args.some(arg => /^http:\\/\\/127\\.0\\.0\\.1:\\d+\\/$/.test(arg))) {",
    '    const child = new EventEmitter();',
    '    child.unref = () => undefined;',
    "    process.nextTick(() => child.emit('error', new Error('Fixture browser opener unavailable.')));",
    '    return child;',
    '  }',
    '  return original.call(this, command, args, options);',
    '};',
  ].join('\n'));
  return preload;
}

function fixtureEnvironment(directory) {
  const environment = { ...process.env, HOME: directory, USERPROFILE: directory };
  for (const name of [
    'PERSONAL_ACCESS_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN', 'CODEX_API_KEY', 'OPENAI_API_KEY',
    'CURSOR_API_KEY', 'OPENCODE_API_KEY', 'NODE_OPTIONS',
  ]) delete environment[name];
  return environment;
}

function awaitLaunch(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Packaged web setup did not start its local session.')), 30_000);
    const onData = chunk => {
      output = `${output}${chunk.toString('utf8')}`.slice(-64 * 1024);
      const url = /Local setup assistant:\s*(http:\/\/127\.0\.0\.1:\d+\/)/u.exec(output)?.[1];
      const code = /Browser pairing code:\s*([a-f0-9]{16})/u.exec(output)?.[1];
      if (!url || !code || !output.includes('If the browser does not open')) return;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      resolve({ url, code, fallbackPrinted: output.includes('If the browser does not open') });
    };
    child.stdout.on('data', onData);
    child.once('close', () => {
      clearTimeout(timer);
      reject(new Error('Packaged web setup exited before opening its local session.'));
    });
    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error('Packaged web setup process could not start.'));
    });
  });
}

async function assertResponse(url, options, expected) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8_000) });
  if (response.status !== expected) throw new Error(`Packaged web session returned HTTP ${response.status}; expected ${expected}.`);
  return response;
}

/** Starts only a fixture session; it never confirms a repository or submits a PAT. */
async function smokePackagedWebSession(cliPath, directory) {
  const repository = path.join(directory, 'fixture-repository');
  createFixtureRepository(repository);
  const preload = suppressBrowserOpener(directory);
  const child = spawn(process.execPath, ['--require', preload, cliPath, 'setup', '--web'], {
    cwd: repository, env: fixtureEnvironment(directory), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const exited = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  try {
    const { url, code, fallbackPrinted } = await awaitLaunch(child);
    if (!fallbackPrinted) throw new Error('Packaged web setup omitted the browser fallback instructions.');
    const page = await assertResponse(url, undefined, 200);
    const html = await page.text();
    const asset = /(?:\.\/)?(assets\/[A-Za-z0-9._-]+\.js)/u.exec(html)?.[1];
    if (!asset) throw new Error('Packaged web setup page has no JavaScript asset.');
    await assertResponse(new URL(asset, url), undefined, 200);
    await assertResponse(new URL('api/state', url), undefined, 403);
    const origin = new URL(url).origin;
    const headers = { Origin: origin, 'Content-Type': 'application/json' };
    const pair = await assertResponse(new URL('api/pair', url), {
      method: 'POST', headers, body: JSON.stringify({ code }),
    }, 200);
    const { sessionKey } = await pair.json();
    if (!/^[a-f0-9]{64}$/u.test(sessionKey)) throw new Error('Packaged web pairing did not return a session key.');
    const state = await assertResponse(new URL('api/state', url), {
      headers: { 'X-Setup-Session-Key': sessionKey },
    }, 200);
    const view = await state.json();
    if (view.repository !== 'fixture/setup-smoke') throw new Error('Packaged web session resolved the wrong fixture repository.');
    const takeover = await assertResponse(new URL('api/takeover', url), {
      method: 'POST', headers: { ...headers, 'X-Setup-Session-Key': sessionKey }, body: JSON.stringify({ code }),
    }, 200);
    const { capability } = await takeover.json();
    if (typeof capability !== 'string' || !capability) throw new Error('Packaged web controller capability is missing.');
    await assertResponse(new URL('api/cancel', url), {
      method: 'POST', headers: { ...headers, 'X-Setup-Session-Key': sessionKey, 'X-Setup-Capability': capability },
      body: '{}',
    }, 200);
    await assertResponse(new URL('api/close', url), {
      method: 'POST', headers: { ...headers, 'X-Setup-Session-Key': sessionKey, 'X-Setup-Capability': capability },
      body: '{}',
    }, 200);
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Packaged web session did not close.')), 15_000);
      void exited.then(value => { clearTimeout(timer); resolve(value); });
    });
    if (result.signal || ![0, 130].includes(result.code)) throw new Error('Packaged web session exited unexpectedly.');
    if (fixtureGit(repository, 'status', '--porcelain')) throw new Error('Packaged web smoke changed its fixture repository.');
  } finally {
    if (child.exitCode === null) child.kill();
    await exited;
  }
}

module.exports = { smokePackagedWebSession };
