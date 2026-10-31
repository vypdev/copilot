/** Real configured verifier for the disposable CPython loader acceptance. */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const inside = (root, value) => { const part = path.relative(root, value); return part === '' || part !== '..' && !part.startsWith('../') && !path.isAbsolute(part); };
const home = fs.realpathSync(process.env.HOME);
const cache = fs.realpathSync(process.env.RUNNER_TOOL_CACHE);
const library = fs.realpathSync(process.env.LD_LIBRARY_PATH || '');
if (!inside(cache, library) || !fs.statSync(library).isDirectory()) throw new Error('FIXTURE_FAILURE:python-library-ownership');
for (const key of ['PAT', 'NODE_OPTIONS', 'PYTHONHOME', 'PYTHONPATH', 'LD_PRELOAD', 'LD_AUDIT', 'COPILOT_FIXTURE_PYTHON_PREFIX']) {
    if (process.env[key] !== undefined) throw new Error('FIXTURE_FAILURE:inherited-options');
}
const result = cp.spawnSync('python3', ['-B', '-m', 'unittest', '-q', 'test_copilot_runtime'], {
    env: process.env, encoding: 'utf8', shell: false, timeout: 30_000, maxBuffer: 8_192,
});
if (result.error || result.status !== 0 || !/\bOK\b/u.test(result.stderr || '')) throw new Error('FIXTURE_FAILURE:python-verifier');
if (fs.realpathSync(home) !== home) throw new Error('FIXTURE_FAILURE:python-home');
console.log(JSON.stringify({ fixture: 'private-python-loader', version: '3.11.17', actualVerifierPassed: true,
    approvedLibrary: true, inheritedOptionsExcluded: true }));
