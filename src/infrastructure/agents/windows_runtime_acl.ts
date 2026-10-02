import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const SET_PRIVATE_ACL = `
$ErrorActionPreference = 'Stop'
$path = $env:COPILOT_PRIVATE_PATH
$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = Get-Acl -LiteralPath $path
$acl.SetAccessRuleProtection($true, $false)
foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($rule) }
$inheritance = [System.Security.AccessControl.InheritanceFlags]::None
if ($env:COPILOT_PRIVATE_DIRECTORY -eq '1') {
  $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
}
$rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
  $me,
  [System.Security.AccessControl.FileSystemRights]::FullControl,
  $inheritance,
  [System.Security.AccessControl.PropagationFlags]::None,
  [System.Security.AccessControl.AccessControlType]::Allow
)
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $path -AclObject $acl
`;

const VERIFY_PRIVATE_ACL = `
$ErrorActionPreference = 'Stop'
$path = $env:COPILOT_PRIVATE_PATH
$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$acl = Get-Acl -LiteralPath $path
$owner = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
$rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
if (-not $acl.AreAccessRulesProtected -or $owner -ne $me -or $rules.Count -ne 1) { throw 'Unsafe managed runtime ACL' }
$rule = $rules[0]
if ($rule.IdentityReference.Value -ne $me -or
    $rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or
    ($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl) {
  throw 'Unsafe managed runtime ACL'
}
`;

function runAclScript(script: string, path: string, directory: boolean): void {
    const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
    const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], {
        env: {
            SystemRoot: systemRoot,
            PATH: process.env.PATH,
            COPILOT_PRIVATE_PATH: path,
            COPILOT_PRIVATE_DIRECTORY: directory ? '1' : '0',
        },
        stdio: 'ignore',
        timeout: 15_000,
        windowsHide: true,
    });
}

export function makeWindowsRuntimePathPrivate(path: string, directory: boolean): void {
    if (process.platform === 'win32') runAclScript(SET_PRIVATE_ACL, path, directory);
}

export function verifyWindowsRuntimePathPrivate(path: string, directory: boolean): void {
    if (process.platform === 'win32') runAclScript(VERIFY_PRIVATE_ACL, path, directory);
}
