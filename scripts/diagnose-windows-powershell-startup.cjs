// Read-only cold-start comparison. Output is a closed timing/status report,
// never process output, environment contents, paths, or error messages.
const { spawnSync } = require('node:child_process');
const { buildWindowsAclProbeEnvironment, systemTool } = require('../src/infrastructure/agents/windows_executable_trust.cjs');

if (process.platform !== 'win32') throw new Error('This diagnostic requires Windows.');
const executable = systemTool('WindowsPowerShell\\v1.0\\powershell.exe');
const ready = "Write-Output 'copilot-probe-ready'";
const consoleReady = "[Console]::Out.WriteLine('copilot-probe-ready')";
const utilityDll = systemTool('WindowsPowerShell\\v1.0\\Microsoft.PowerShell.Commands.Utility.dll').replace(/'/gu, "''");
const utilityManifest = systemTool('WindowsPowerShell\\v1.0\\Modules\\Microsoft.PowerShell.Utility\\Microsoft.PowerShell.Utility.psd1').replace(/'/gu, "''");
const importDll = `Import-Module -Name '${utilityDll}' -ErrorAction Stop;`;
const importManifest = `Import-Module -Name '${utilityManifest}' -ErrorAction Stop;`;
const managementManifest = systemTool('WindowsPowerShell\\v1.0\\Modules\\Microsoft.PowerShell.Management\\Microsoft.PowerShell.Management.psd1').replace(/'/gu, "''");
const importManagement = `Import-Module -Name '${managementManifest}' -ErrorAction Stop;`;
const hashReady = "Get-FileHash -Algorithm SHA256 -LiteralPath ([IO.Path]::Combine($env:SystemRoot,'System32','whoami.exe')) | Out-Null; [Console]::Out.WriteLine('copilot-probe-ready')";
const hashProbe = imports => `$ErrorActionPreference='Stop';$PSModuleAutoLoadingPreference='None';try{${imports}${hashReady}}catch{if($_.Exception -is [Management.Automation.CommandNotFoundException]){[Console]::Out.WriteLine('command-not-found')}else{[Console]::Out.WriteLine('command-failed')};exit 1}`;
const results = [];
for (const [environment, env, command] of [
  ['runner-baseline', process.env, ready],
  ['isolated-acl', buildWindowsAclProbeEnvironment(), ready],
  ['isolated-acl-console', buildWindowsAclProbeEnvironment(), consoleReady],
  ['isolated-acl-system-utility-manifest', buildWindowsAclProbeEnvironment(), `${importManifest}${ready}`],
  ['isolated-acl-system-utility-dll', buildWindowsAclProbeEnvironment(), `${importDll}${ready}`],
  ['isolated-acl-system-utility-json', buildWindowsAclProbeEnvironment(), `${importDll}[void](ConvertTo-Json -InputObject @('safe'));${consoleReady}`],
  ['isolated-acl-utility-hash', buildWindowsAclProbeEnvironment(), hashProbe(importManifest)],
  ['isolated-acl-utility-management-hash', buildWindowsAclProbeEnvironment(), hashProbe(`${importManifest}${importManagement}`)],
]) {
  const start = performance.now();
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command];
  const result = spawnSync(executable, args, { env, encoding: 'utf8', timeout: 20_000, maxBuffer: 4096, windowsHide: true });
  results.push({
    environment,
    status: result.error?.code === 'ETIMEDOUT' ? 'timeout'
      : result.error ? 'process-error'
        : result.status === 0 && result.stdout.trim() === 'copilot-probe-ready' ? 'ready'
          : result.stdout.trim() === 'command-not-found' ? 'command-not-found'
            : result.stdout.trim() === 'command-failed' ? 'command-failed' : 'unexpected-result',
    elapsedMs: Math.round(performance.now() - start),
  });
}
console.log(JSON.stringify({ schemaVersion: 1, results }));
