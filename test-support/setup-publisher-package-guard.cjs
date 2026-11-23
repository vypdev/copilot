'use strict';

// Test-process boundary only. No credential, request header or raw URL is recorded.
const fs = require('node:fs');
const persist = fs.writeFileSync.bind(fs);
const reportPath = process.env.COPILOT_PUBLISHER_GUARD_REPORT;
if (!reportPath) throw new Error('Missing packaged publisher guard report.');
// Reserve the guard's own output before installing the product-effect fences.
const reportDescriptor = fs.openSync(reportPath, 'wx', 0o600);
const observations = { networkAttempts: [], filesystemWrites: [], childProcesses: [], listeners: [], undiciRequests: 0 };
function deny(kind, operation) {
  observations[kind].push(operation);
  throw new Error('Packaged publisher negative control attempted an effect.');
}

// Undici diagnostics are observational: subscribers must not throw.
require('node:diagnostics_channel').channel('undici:request:create').subscribe(() => {
  observations.undiciRequests += 1;
});
globalThis.fetch = () => deny('networkAttempts', 'fetch');
for (const name of ['node:http', 'node:https']) {
  const transport = require(name);
  for (const operation of ['request', 'get']) transport[operation] = () => deny('networkAttempts', operation);
}
for (const operation of ['send', 'sendto', 'connect']) {
  require('node:dgram').Socket.prototype[operation] = () => deny('networkAttempts', 'datagram.' + operation);
}
require('node:dgram').Socket.prototype.bind = () => deny('listeners', 'datagram.bind');
require('node:net').Socket.prototype.connect = () => deny('networkAttempts', 'socket.connect');
require('node:tls').connect = () => deny('networkAttempts', 'tls.connect');
require('node:net').Server.prototype.listen = () => deny('listeners', 'listen');
// c-ares and OS resolution bypass JS net/dgram hooks. Fence both public
// callback/promise APIs and Resolver instances, including version-added records.
const dns = require('node:dns');
const dnsPromises = require('node:dns/promises');
for (const [target, surface] of [[dns, 'callback'], [dnsPromises, 'promise'],
  [dns.Resolver.prototype, 'callback-resolver'], [dnsPromises.Resolver.prototype, 'promise-resolver']]) {
  for (const operation of Object.getOwnPropertyNames(target)) {
    if (/^(?:lookup(?:Service)?|resolve.*|reverse)$/.test(operation) && typeof target[operation] === 'function') {
      target[operation] = () => deny('networkAttempts', 'dns.' + surface + '.' + operation);
    }
  }
}
for (const operation of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  require('node:child_process')[operation] = () => deny('childProcesses', operation);
}
for (const operation of ['writeFile', 'appendFile', 'mkdir', 'mkdtemp', 'rename', 'unlink', 'rm', 'rmdir',
  'copyFile', 'cp', 'chmod', 'chown', 'symlink', 'link', 'truncate', 'createWriteStream']) {
  for (const name of [operation, operation + 'Sync']) {
    if (typeof fs[name] === 'function') fs[name] = () => deny('filesystemWrites', name);
  }
  if (typeof fs.promises[operation] === 'function') fs.promises[operation] = async () => deny('filesystemWrites', operation);
}
function readOnly(flags) {
  return flags === undefined || flags === 'r' || flags === 'rs'
    || typeof flags === 'number' && !(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR
      | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND));
}
for (const [target, name] of [[fs, 'open'], [fs, 'openSync'], [fs.promises, 'open']]) {
  const original = target[name];
  target[name] = function (file, flags) {
    if (!readOnly(flags)) return deny('filesystemWrites', name);
    return original.apply(this, arguments);
  };
}
require('node:module').syncBuiltinESMExports();
process.on('exit', exitCode => persist(reportDescriptor, JSON.stringify({ ...observations, exitCode }) + '\n'));
