// Read-only service prerequisites. Raw process output, account names, paths,
// environment values and setup markers never cross this diagnostic boundary.
const { spawnSync } = require('node:child_process');
const { buildWindowsAclProbeEnvironment, systemTool } = require('../src/infrastructure/agents/windows_executable_trust.cjs');

if (process.platform !== 'win32') throw new Error('This diagnostic requires Windows.');
const executable = systemTool('WindowsPowerShell\\v1.0\\powershell.exe');
const environment = buildWindowsAclProbeEnvironment();
for (const key of ['USERPROFILE', 'CODEX_HOME', 'TEMP', 'TMP']) {
  if (process.env[key] !== undefined) environment[key] = process.env[key];
}
const utilityManifest = systemTool('WindowsPowerShell\\v1.0\\Modules\\Microsoft.PowerShell.Utility\\Microsoft.PowerShell.Utility.psd1').replace(/'/gu, "''");
const script = `Import-Module -Name '${utilityManifest}' -ErrorAction Stop
# Read-only host prerequisites. Never provisions accounts, rewrites ACLs,
# changes the mutex, or reads credentials/sandbox secret files.
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$accountKind = if ($identity.IsSystem) { 'system' } elseif ($identity.Name.StartsWith('NT SERVICE\\', [StringComparison]::OrdinalIgnoreCase)) { 'virtual-service' } else { 'windows-account' }
$codexRoot = if ([string]::IsNullOrWhiteSpace($env:CODEX_HOME)) { [IO.Path]::Combine([Environment]::GetFolderPath('UserProfile'), '.codex') } else { $env:CODEX_HOME }
$markerPresent = [IO.File]::Exists([IO.Path]::Combine($codexRoot, '.sandbox', 'setup_marker.json'))
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CopilotSetupMutexReadProbe {
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern IntPtr OpenMutexW(uint desiredAccess, bool inheritHandle, string name);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool CloseHandle(IntPtr handle);
}
"@
# CreateMutexW reopens an existing named mutex with MUTEX_ALL_ACCESS.
# OpenMutexW requests that same access without creating or acquiring it.
$handle = [CopilotSetupMutexReadProbe]::OpenMutexW(0x001F0001, $false, 'Global\\CodexSandboxSetup')
$mutexError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
$mutexAdmission = if ($handle -ne [IntPtr]::Zero) { 'accessible' } else {
    switch ($mutexError) {
        2 { 'absent' }
        5 { 'access-denied' }
        default { 'unavailable' }
    }
}
if ($handle -ne [IntPtr]::Zero) { [void][CopilotSetupMutexReadProbe]::CloseHandle($handle) }
[ordered]@{
    schemaVersion = 1
    windowsVersion = [Environment]::OSVersion.Version.ToString()
    accountKind = $accountKind
    elevatedAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    configuredCodexHome = -not [string]::IsNullOrWhiteSpace($env:CODEX_HOME)
    setupMarkerPresent = $markerPresent
    setupMutexAdmission = $mutexAdmission
} | ConvertTo-Json -Compress
`;
const processResult = spawnSync(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
  env: environment, encoding: 'utf8', timeout: 20_000, maxBuffer: 4096, windowsHide: true,
});
let report = { schemaVersion: 1, state: processResult.error?.code === 'ETIMEDOUT' ? 'timeout' : 'unavailable' };
if (!processResult.error && processResult.status === 0) {
  try {
    const value = JSON.parse(processResult.stdout.trim());
    if (value?.schemaVersion === 1 && /^\d{1,6}\.\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(value.windowsVersion)
      && ['system', 'virtual-service', 'windows-account'].includes(value.accountKind)
      && ['accessible', 'absent', 'access-denied', 'unavailable'].includes(value.setupMutexAdmission)
      && ['elevatedAdministrator', 'configuredCodexHome', 'setupMarkerPresent'].every(key => typeof value[key] === 'boolean')) {
      report = { schemaVersion: 1, state: 'observed', windowsVersion: value.windowsVersion, accountKind: value.accountKind,
        elevatedAdministrator: value.elevatedAdministrator, configuredCodexHome: value.configuredCodexHome,
        setupMarkerPresent: value.setupMarkerPresent, setupMutexAdmission: value.setupMutexAdmission };
    }
  } catch { /* Only closed unavailable/timeout states are admitted. */ }
}
console.log(JSON.stringify(report));
