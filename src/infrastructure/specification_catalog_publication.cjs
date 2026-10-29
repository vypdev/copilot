const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const INDEX = 'CATALOG.md';
const directoryFlags = fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0)
  | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0);
const unsafe = () => new Error('Catalog access requires real directories and a regular non-symlink index.');
const changed = () => new Error('The catalog path changed during access.');
const sameObject = (left, right) => left.ino > 0n && left.dev === right.dev && left.ino === right.ino;

function entry(name = INDEX) {
  try { return fs.lstatSync(name, { bigint: true }); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

function destination() {
  const current = entry();
  if (current && (!current.isFile() || current.isSymbolicLink())) throw unsafe();
  return current;
}

function enterDirectory(name, expected) {
  const descriptor = fs.openSync(name, directoryFlags);
  try {
    const bound = fs.fstatSync(descriptor, { bigint: true });
    const observed = fs.lstatSync(name, { bigint: true });
    if (!bound.isDirectory() || !observed.isDirectory() || observed.isSymbolicLink()) throw unsafe();
    if (!sameObject(bound, observed)) throw changed();
    if (expected && !sameObject(expected, bound)) throw changed();
    process.chdir(name);
    if (!sameObject(bound, fs.lstatSync('.', { bigint: true }))) throw changed();
    return bound;
  } finally { fs.closeSync(descriptor); }
}

/** Node has no portable openat: pin directories as cwd for synchronous,
 * single-component operations. Never await or call repository code here.
 * POSIX retains the directory through renames; Windows prevents its rename.
 */
function inCatalogDirectory(root, operation) {
  const absoluteRoot = fs.realpathSync(root);
  const previous = fs.realpathSync('.');
  const previousIdentity = fs.lstatSync('.', { bigint: true });
  try {
    const rootIdentity = enterDirectory(absoluteRoot);
    const specsIdentity = enterDirectory('specs');
    function assertRoute() {
      for (const [name, expected] of [[absoluteRoot, rootIdentity], [path.join(absoluteRoot, 'specs'), specsIdentity], ['.', specsIdentity]]) {
        const current = fs.lstatSync(name, { bigint: true });
        if (!current.isDirectory() || current.isSymbolicLink() || !sameObject(expected, current)) throw changed();
      }
    }
    assertRoute();
    return operation(assertRoute);
  } finally {
    // The caller may itself have been in specs before it was renamed. Do not
    // re-enter that old pathname if cwd already retains the original inode.
    if (!sameObject(previousIdentity, fs.lstatSync('.', { bigint: true }))) {
      enterDirectory(previous, previousIdentity);
    }
  }
}

function unchanged(expected, current) {
  return expected === undefined ? current === undefined : current !== undefined
    && sameObject(expected, current) && expected.mode === current.mode
    && expected.size === current.size
    && expected.mtimeNs === current.mtimeNs && expected.ctimeNs === current.ctimeNs;
}

function reportRetainedTemporary(name) {
  console.error('Catalog temporary cleanup could not be completed: ' + name
    + '. An entry may remain in the original specs directory; inspect it and verify ownership before cleanup.');
}

function releaseTemporary(descriptor, owned, temporary) {
  try {
    // A failed first stat does not prove the new entry's identity. Make
    // one bounded recovery attempt while its descriptor is still held.
    if (descriptor !== undefined && owned === undefined) {
      try { owned = fs.fstatSync(descriptor, { bigint: true }); }
      catch {
        // Emit before close/cwd restoration: secondary failures must not
        // hide the possible retained entry. The name is generated here.
        reportRetainedTemporary(temporary);
      }
    }
    // Keep the descriptor open until cleanup to prevent inode reuse.
    // Never remove another writer's replacement at our temporary name.
    const current = owned ? entry(temporary) : undefined;
    if (current && current.isFile() && sameObject(owned, current)) fs.unlinkSync(temporary);
  } catch (error) {
    reportRetainedTemporary(temporary);
    throw error;
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

function publishCatalogMarkdown(root, content) {
  return inCatalogDirectory(root, assertRoute => {
    const expected = destination();
    const temporary = '.copilot-catalog-' + randomUUID() + '.tmp';
    let descriptor, owned;
    try {
      descriptor = fs.openSync(temporary, 'wx', 0o600);
      owned = fs.fstatSync(descriptor, { bigint: true });
      if (!owned.isFile()) throw unsafe();
      fs.writeFileSync(descriptor, content, 'utf8');
      fs.fchmodSync(descriptor, expected ? Number(expected.mode & 0o777n) : 0o666 & ~process.umask());
      fs.fsyncSync(descriptor);
      assertRoute();
      if (!unchanged(expected, destination())) throw changed();
      const candidate = entry(temporary);
      if (!candidate || !candidate.isFile() || !sameObject(owned, candidate)) throw changed();
      if (expected) fs.renameSync(temporary, INDEX);
      else fs.linkSync(temporary, INDEX); // Atomic no-replace creation.
      assertRoute();
      const published = destination();
      if (!published || !sameObject(owned, published)) throw changed();
    } finally { releaseTemporary(descriptor, owned, temporary); }
  });
}

function readCatalogMarkdown(root) {
  return inCatalogDirectory(root, assertRoute => {
    const expected = destination();
    if (!expected) return '';
    const descriptor = fs.openSync(INDEX, fs.constants.O_RDONLY
      | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
    try {
      const opened = fs.fstatSync(descriptor, { bigint: true });
      if (!opened.isFile() || !unchanged(expected, opened)) throw changed();
      assertRoute();
      if (!unchanged(expected, destination())) throw changed();
      const content = fs.readFileSync(descriptor, 'utf8');
      assertRoute();
      if (!unchanged(expected, destination())) throw changed();
      return content;
    } finally { fs.closeSync(descriptor); }
  });
}

module.exports = { publishCatalogMarkdown, readCatalogMarkdown };
