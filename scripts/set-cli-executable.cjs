const { chmodSync } = require('node:fs');
const { join } = require('node:path');

// Windows uses the npm-generated command shim; POSIX launches the bundle.
if (process.platform !== 'win32') {
  chmodSync(join(__dirname, '..', 'build', 'cli', 'index.js'), 0o755);
}
