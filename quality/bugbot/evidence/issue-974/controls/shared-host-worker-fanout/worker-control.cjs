'use strict';

// Manual, model-free runner control. This never imports qualification drivers.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { availableParallelism } = require('node:os');
const { mkdirSync, readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { createHash } = require('node:crypto');

const [rootArg, outputArg] = process.argv.slice(2);
assert(rootArg && outputArg, 'Supply repository root and a new output directory.');
assert(['darwin', 'linux'].includes(process.platform), 'This control uses an owned POSIX process group.');
const root = resolve(rootArg), output = resolve(outputArg);
mkdirSync(output, { recursive: false, mode: 0o700 });
const script = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts['test:bugbot-shadow-verification'];
const words = script.split(' ');
assert.deepEqual(words.slice(0, 3), ['node', '--test', '--test-concurrency=2']);
const files = words.slice(3);
assert.equal(files.length, 14);
assert.equal(new Set(files).size, 14);
assert(files.every(file => file.endsWith('.test.cjs') && !file.startsWith('-')));
assert(availableParallelism() > 3, 'The unbounded counterfactual needs more than three available CPUs.');

const fixture = String.raw`
'use strict';
const { test } = require('node:test');
const { existsSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const id = __filename.split(/[\\/]/).pop();
const root = process.env.WORKER_CONTROL_ROOT;
test(id, async () => {
  await new Promise(resolve => {
    const release = join(root, 'release', id);
    const listener = setInterval(() => {
      if (existsSync(release)) { clearInterval(listener); resolve(); }
    }, 10);
    writeFileSync(join(root, 'started', id), 'started');
    if (existsSync(release)) { clearInterval(listener); resolve(); }
  });
  writeFileSync(join(root, 'finished', id), 'finished');
});
`;

async function observe(name, flags, width) {
  const directory = join(output, name);
  mkdirSync(directory);
  for (const part of ['started', 'finished', 'release', 'fixtures']) mkdirSync(join(directory, part));
  const fixtures = files.map((_, index) => join(directory, 'fixtures', `${index}.test.cjs`));
  fixtures.forEach(file => writeFileSync(file, fixture));
  let peak = 0, stdout = '', stderr = '', previous = '';
  const events = [];
  function scan() {
    const started = readdirSync(join(directory, 'started')).sort();
    const finished = readdirSync(join(directory, 'finished')).sort();
    const active = started.filter(file => !finished.includes(file));
    peak = Math.max(peak, active.length);
    const state = JSON.stringify({ started, finished, active });
    if (state !== previous) { events.push(JSON.parse(state)); previous = state; }
    // The barrier holds each batch until the observed worker width is reached.
    // Release the smaller final batch only after every file has started.
    if (active.length >= width || started.length === files.length) {
      active.forEach(file => writeFileSync(join(directory, 'release', file), 'release'));
    }
  }
  // Poll state rather than relying on host FSEvents availability. No result
  // depends on poll count or elapsed time; only held/released file identities.
  const statePoll = setInterval(scan, 10);
  const args = [...process.execArgv, '--test', '--test-reporter=tap', ...flags, ...fixtures];
  const child = spawn(process.execPath, args, {
    env: { ...process.env, WORKER_CONTROL_ROOT: directory }, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  // Fixture fault containment only; this is not a model/investigation deadline.
  const guard = setTimeout(() => {
    if (child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  }, 20_000);
  let exit;
  try {
    exit = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
  } finally {
    clearTimeout(guard); clearInterval(statePoll);
    scan();
    writeFileSync(join(directory, 'stdout.tap'), stdout);
    writeFileSync(join(directory, 'stderr.log'), stderr);
    writeFileSync(join(directory, 'events.json'), JSON.stringify(events, null, 2) + '\n');
  }
  const result = { name, flags, width, peak, started: readdirSync(join(directory, 'started')).length,
    finished: readdirSync(join(directory, 'finished')).length, ...exit };
  writeFileSync(join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  assert.deepEqual(exit, { code: 0, signal: null });
  assert.equal(result.started, files.length); assert.equal(result.finished, files.length);
  assert.match(stdout, /# pass 14\b/); assert.match(stdout, /# fail 0\b/);
  assert.match(stdout, /# cancelled 0\b/); assert.match(stdout, /# skipped 0\b/);
  assert.equal(peak, width);
  return result;
}

(async () => {
  const baseline = await observe('original-default', [], Math.min(files.length, availableParallelism() - 1));
  assert(baseline.peak > 2, 'The original command must fail the proposed two-worker bound.');
  const fixed = await observe('fixed-two-workers', ['--test-concurrency=2'], 2);
  const result = { schemaVersion: 1, node: process.version,
    nodeSha256: createHash('sha256').update(readFileSync(process.execPath)).digest('hex'),
    execArgv: process.execArgv, availableParallelism: availableParallelism(), files, baseline, fixed,
    limitation: 'Inert local file-worker barriers prove fanout, not original Linux host load, timeout causation or qualification.' };
  writeFileSync(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
})().catch(error => { console.error(error); process.exitCode = 1; });
