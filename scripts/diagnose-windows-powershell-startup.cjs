// Read-only cold-start comparison. Output is a closed timing/status report,
// never process output, environment contents, paths, or error messages.
const { spawnSync } = require('node:child_process');
const { buildWindowsAclProbeEnvironment, systemTool } = require('../src/infrastructure/agents/windows_executable_trust.cjs');

if (process.platform !== 'win32') throw new Error('This diagnostic requires Windows.');
const executable = systemTool('WindowsPowerShell\\v1.0\\powershell.exe');
const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', "Write-Output 'copilot-probe-ready'"];
const results = [];
const minimal = { SystemRoot: buildWindowsAclProbeEnvironment().SystemRoot,
  WINDIR: buildWindowsAclProbeEnvironment().WINDIR, PATH: buildWindowsAclProbeEnvironment().PATH };
for (const [environment, env] of [
  ['runner-baseline', process.env],
  ['runner-baseline-cache-off', { ...process.env, PSModuleAnalysisCachePath: 'NUL' }],
  ['runner-baseline-system-module-path', { ...process.env, PSModulePath: buildWindowsAclProbeEnvironment().PSModulePath }],
  ['isolated-without-module-overrides', minimal],
  ['isolated-cache-off-only', { ...minimal, PSModuleAnalysisCachePath: 'NUL' }],
  ['isolated-system-module-path-only', { ...minimal, PSModulePath: buildWindowsAclProbeEnvironment().PSModulePath }],
]) {
  const start = performance.now();
  const result = spawnSync(executable, args, { env, encoding: 'utf8', timeout: 20_000, maxBuffer: 4096, windowsHide: true });
  results.push({
    environment,
    status: result.error?.code === 'ETIMEDOUT' ? 'timeout'
      : result.error ? 'process-error'
        : result.status === 0 && result.stdout.trim() === 'copilot-probe-ready' ? 'ready' : 'unexpected-result',
    elapsedMs: Math.round(performance.now() - start),
  });
}
console.log(JSON.stringify({ schemaVersion: 1, results }));
