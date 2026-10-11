// Read-only cold-start comparison. Output is a closed timing/status report,
// never process output, environment contents, paths, or error messages.
const { spawnSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { buildWindowsAclProbeEnvironment, systemTool } = require('../src/infrastructure/agents/windows_executable_trust.cjs');

if (process.platform !== 'win32') throw new Error('This diagnostic requires Windows.');
const executable = systemTool('WindowsPowerShell\\v1.0\\powershell.exe');
const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', "Write-Output 'copilot-probe-ready'"];
const results = [];
const probeRoot = mkdtempSync(join(tmpdir(), 'copilot-startup-evidence-'));
const profile = Object.fromEntries(['USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP'].map(key => {
  const path = join(probeRoot, key); mkdirSync(path); return [key, path];
}));
try {
for (const [environment, env] of [
  ['isolated-acl', buildWindowsAclProbeEnvironment()],
  ['runner-baseline', process.env],
  ['isolated-acl-after-baseline', buildWindowsAclProbeEnvironment()],
  ['isolated-acl-system-metadata', { ...buildWindowsAclProbeEnvironment(),
    SystemDrive: process.env.SystemDrive, OS: 'Windows_NT', PATHEXT: '.EXE;.CMD', ComSpec: systemTool('cmd.exe') }],
  ['isolated-acl-runner-temp', { ...buildWindowsAclProbeEnvironment(), TEMP: process.env.TEMP, TMP: process.env.TMP }],
  ['isolated-acl-runner-profile', { ...buildWindowsAclProbeEnvironment(), USERPROFILE: process.env.USERPROFILE,
    APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA }],
  ['isolated-private-profile-cache-off', { ...buildWindowsAclProbeEnvironment(), ...profile }],
  ['isolated-private-profile-absolute-cache', { ...buildWindowsAclProbeEnvironment(), ...profile,
    PSModuleAnalysisCachePath: join(profile.LOCALAPPDATA, 'module-analysis.cache') }],
  ['isolated-private-profile-native-cache', { ...buildWindowsAclProbeEnvironment(), ...profile,
    PSModuleAnalysisCachePath: undefined }],
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
} finally {
  try { rmSync(probeRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch { results.push({ environment: 'probe-cleanup', status: 'cleanup-unavailable', elapsedMs: 0 }); }
}
console.log(JSON.stringify({ schemaVersion: 1, results }));
