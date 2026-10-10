const { lstatSync, realpathSync } = require('node:fs');
const { win32 } = require('node:path');

/** Parse machine facts without consulting a mutable search path or child environment. */
function resolveWindowsSystemRoot(source) {
  const root = source.SystemRoot;
  const windir = source.WINDIR;
  if (typeof root !== 'string' || typeof windir !== 'string'
    || !/^[a-z]:\\[^\\/]+$/iu.test(root)
    || win32.normalize(root).toLowerCase() !== win32.normalize(windir).toLowerCase()
    || win32.basename(root).toLowerCase() !== 'windows') {
    throw new Error('Windows runner system directory is invalid or inconsistent.');
  }
  const drive = win32.parse(root).root.slice(0, 2);
  if (typeof source.SystemDrive !== 'string'
    || source.SystemDrive.toLowerCase() !== drive.toLowerCase()) {
    throw new Error('Windows runner system drive does not match its system directory.');
  }
  return win32.normalize(root);
}

function captureWindowsSystemRoot(source) {
  const root = resolveWindowsSystemRoot(source);
  for (const directory of [root, win32.join(root, 'System32')]) {
    if (!lstatSync(directory).isDirectory()
      || win32.normalize(realpathSync.native(directory)).toLowerCase() !== directory.toLowerCase()) {
      throw new Error('Windows runner system directory is not a canonical directory.');
    }
  }
  return root;
}

// The Action's startup environment comes from its runner. Capture it before
// workflow data or provider subprocesses can mutate process.env.
const systemRoot = process.platform === 'win32' ? captureWindowsSystemRoot(process.env) : undefined;

function trustedWindowsSystemRoot() {
  if (!systemRoot) throw new Error('Windows system tools are unavailable on this platform.');
  return systemRoot;
}

module.exports = { resolveWindowsSystemRoot, trustedWindowsSystemRoot };
