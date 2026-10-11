// Read-only cold-start comparison. Output is a closed timing/status report,
// never process output, environment contents, paths, or error messages.
const { spawnSync } = require('node:child_process');
const { buildWindowsAclProbeEnvironment, systemTool } = require('../src/infrastructure/agents/windows_executable_trust.cjs');

if (process.platform !== 'win32') throw new Error('This diagnostic requires Windows.');
const executable = systemTool('WindowsPowerShell\\v1.0\\powershell.exe');
const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', "Write-Output 'copilot-probe-ready'"];
const results = [];
for (const [environment, env] of [
  ['isolated-acl', buildWindowsAclProbeEnvironment()],
  ['runner-baseline', process.env],
  ['isolated-acl-after-baseline', buildWindowsAclProbeEnvironment()],
  ['isolated-acl-system-metadata', { ...buildWindowsAclProbeEnvironment(),
    SystemDrive: process.env.SystemDrive, OS: 'Windows_NT', PATHEXT: '.EXE;.CMD', ComSpec: systemTool('cmd.exe') }],
  ['isolated-acl-runner-temp', { ...buildWindowsAclProbeEnvironment(), TEMP: process.env.TEMP, TMP: process.env.TMP }],
  ['isolated-acl-runner-profile', { ...buildWindowsAclProbeEnvironment(), USERPROFILE: process.env.USERPROFILE,
    APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA }],
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
