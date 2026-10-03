const { execFileSync } = require('node:child_process');
const { Buffer } = require('node:buffer');
const { realpathSync } = require('node:fs');
const { hostname } = require('node:os');
const { dirname, join } = require('node:path');

const SID_PATTERN = /S-\d+(?:-\d+)+/u;
const TRUSTED_INSTALLER_SID = 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464';
const MUTATING_RIGHTS = new Set(['GA', 'GW', 'FA', 'FW', 'SD', 'DC', 'WD', 'WO']);
const DIRECTORY_REPLACEMENT_RIGHTS = new Set(['GA', 'FA', 'SD', 'DC', 'WD', 'WO']);
const KNOWN_RIGHTS = new Set([...MUTATING_RIGHTS, 'GR', 'GX', 'FR', 'FX', 'RC']);
const KNOWN_DIRECTORY_RIGHTS = new Set([...KNOWN_RIGHTS, 'LC']);

function systemTool(name) {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  return join(systemRoot, 'System32', name);
}

function isLocalWindowsAdministrator(sid, accountDomain, computerName) {
  return sid.endsWith('-500') && accountDomain?.toLowerCase() === computerName.toLowerCase();
}

function currentWindowsUserIdentity() {
  const identity = execFileSync(systemTool('whoami.exe'), ['/user', '/fo', 'csv', '/nh'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000, windowsHide: true,
  });
  const sid = identity.match(SID_PATTERN)?.[0];
  if (!sid) throw new Error('Could not identify the Windows runtime owner.');
  const account = /^\uFEFF?"([^"\r\n]+)"\s*,/u.exec(identity)?.[1];
  const accountDomain = account?.split('\\')[0];
  return { sid, localAdministrator: isLocalWindowsAdministrator(sid, accountDomain, hostname()) };
}

function installedExecutableDescriptor(path, directory = false) {
  // icacls /save omits the owner; a read-only full descriptor is required.
  const command = "$ErrorActionPreference='Stop'; [System.IO."
    + (directory ? 'Directory' : 'File') + "]::GetAccessControl('"
    + path.replace(/'/gu, "''")
    + "').GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::All)";
  return execFileSync(systemTool(join('WindowsPowerShell', 'v1.0', 'powershell.exe')),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000, windowsHide: true,
    }).replace(/^\uFEFF/u, '').trim();
}

function grantsMutation(rights, directory = false) {
  if (/^0x[0-9a-f]+$/iu.test(rights)) {
    const mask = Number.parseInt(rights.slice(2), 16);
    if (!Number.isSafeInteger(mask) || mask > 0xFFFF_FFFF) {
      throw new Error('Unrecognized executable ACL rights.');
    }
    const genericWrite = 0x4000_0000;
    const genericAll = 0x1000_0000;
    const fileMutation = 0x000D_0156;
    const directoryReplacement = 0x000D_0040;
    return (mask & (directory ? genericAll | directoryReplacement : genericWrite | genericAll | fileMutation)) !== 0;
  }
  const tokens = rights.match(/.{2}/gu) ?? [];
  const known = directory ? KNOWN_DIRECTORY_RIGHTS : KNOWN_RIGHTS;
  if (tokens.length * 2 !== rights.length || tokens.some(token => !known.has(token))) {
    throw new Error(`Unrecognized executable ACL rights (${rights}).`);
  }
  const dangerous = directory ? DIRECTORY_REPLACEMENT_RIGHTS : MUTATING_RIGHTS;
  return tokens.some(token => dangerous.has(token));
}

function assertWindowsExecutableDacl(sddl, userSid, localAdministrator, directory = false) {
  const owner = /^O:([^:]+?)(?=G:|D:|S:|$)/u.exec(sddl)?.[1];
  const trusted = new Set([userSid, 'SY', 'S-1-5-18', 'BA', 'S-1-5-32-544']);
  if (localAdministrator) trusted.add('LA');
  if (directory) trusted.add(TRUSTED_INSTALLER_SID);
  const section = /D:.*?(?=S:|$)/u.exec(sddl)?.[0];
  if (!owner || !trusted.has(owner)) throw new Error(`Unsafe executable ACL owner (${owner || 'missing'}).`);
  if (!section) throw new Error('Missing executable ACL DACL.');
  const firstAce = section.indexOf('(');
  if (firstAce < 0 || !/^D:(?:P|AI|AR)*$/u.test(section.slice(0, firstAce))) {
    throw new Error('Unrecognized executable ACL.');
  }
  const entries = section.slice(firstAce);
  const aces = [...entries.matchAll(/\(([^()]*)\)/gu)].map(match => match[1].split(';'));
  if (aces.length === 0 || entries.replace(/\([^()]*\)/gu, '') !== '') {
    throw new Error('Unrecognized executable ACL entries.');
  }
  for (const fields of aces) {
    if (fields.length !== 6 || !['A', 'D'].includes(fields[0]) || fields[3] || fields[4]
      || !/^(?:(?:OI|CI|NP|IO|ID))*$/u.test(fields[1])) {
      throw new Error('Unrecognized executable ACL entry.');
    }
    if (fields[0] === 'D' || fields[1].includes('IO') || trusted.has(fields[5])) continue;
    if (grantsMutation(fields[2], directory)) {
      // The public boundary wraps this detail; isolated diagnostics keep the ACE.
      throw new Error(`Agent executable is writable by another principal (${fields[5]}:${fields[2]}).`);
    }
  }
}

function assertWindowsExecutableParentDacl(sddl, userSid, localAdministrator) {
  assertWindowsExecutableDacl(sddl, userSid, localAdministrator, true);
}

function verifyWindowsAgentExecutableAcl(path) {
  const identity = currentWindowsUserIdentity();
  const canonical = realpathSync(path);
  assertWindowsExecutableDacl(installedExecutableDescriptor(canonical), identity.sid, identity.localAdministrator);
  let parent = dirname(canonical);
  while (true) {
    try {
      assertWindowsExecutableParentDacl(installedExecutableDescriptor(parent, true), identity.sid, identity.localAdministrator);
    } catch (error) {
      throw new Error(`Unsafe Windows executable ancestor ${parent}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    const next = dirname(parent);
    if (next === parent) break;
    parent = next;
  }
}

module.exports = {
  assertWindowsExecutableDacl,
  assertWindowsExecutableParentDacl,
  currentWindowsUserIdentity,
  isLocalWindowsAdministrator,
  systemTool,
  verifyWindowsAgentExecutableAcl,
};
