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
const metadataKeys = ["SystemDrive", "OS", "ComSpec", "PATHEXT", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH", "ALLUSERSPROFILE", "CommonProgramFiles", "CommonProgramFiles(x86)", "ProgramFiles", "ProgramFiles(x86)", "ProgramData", "PUBLIC", "USERDOMAIN", "USERNAME", "COMPUTERNAME", "LOGONSERVER", "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS", "SESSIONNAME", "TEMP", "TMP"];
const metadata = Object.fromEntries(metadataKeys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
try {
for (const [environment, env] of [
  ['isolated-acl', buildWindowsAclProbeEnvironment()],
  ['runner-baseline', process.env],
  ['isolated-combined-windows-metadata', { ...buildWindowsAclProbeEnvironment(), ...metadata }],
  ['isolated-combined-private-profile', { ...buildWindowsAclProbeEnvironment(), ...metadata, ...profile }],
  ['isolated-runner-module-path', { ...buildWindowsAclProbeEnvironment(), PSModulePath: process.env.PSModulePath }],
  ['isolated-combined-metadata-runner-module-path', { ...buildWindowsAclProbeEnvironment(), ...metadata, PSModulePath: process.env.PSModulePath }],
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
