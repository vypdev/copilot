import * as fs from 'node:fs';
import { join } from 'node:path';
import { SETUP_VERIFICATION_ACTION_PATH, SETUP_VERIFICATION_ACTION_PARENTS, type SetupVerificationActionState } from '../domain/setup_verification_action';

const unsafe = () => new Error(`${SETUP_VERIFICATION_ACTION_PATH}: setup requires real parent directories and a regular action file. Inspect the path and remove unsafe links or collisions, then review setup again. Existing contents were preserved.`);
const stale = () => new Error(`${SETUP_VERIFICATION_ACTION_PATH}: the path changed after review. No existing action was replaced. Review a fresh setup plan.`);
const sameDirectory = (left: fs.BigIntStats, right: fs.BigIntStats): boolean => left.ino > 0n
  && left.dev === right.dev && left.ino === right.ino;
const directoryFlags = fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0)
  | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0);
function entry(path: string): fs.BigIntStats | undefined {
  try { return fs.lstatSync(path, { bigint: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

/** Inspect metadata only: consumer action contents and auxiliary files are never read. */
export function inspectSetupVerificationActionPath(root: string): SetupVerificationActionState {
  for (const parent of SETUP_VERIFICATION_ACTION_PARENTS) {
    const info = entry(join(root, parent));
    if (!info) return 'create';
    if (!info.isDirectory() || info.isSymbolicLink()) throw unsafe();
  }
  const info = entry(join(root, SETUP_VERIFICATION_ACTION_PATH));
  if (!info) return 'create';
  if (!info.isFile() || info.isSymbolicLink()) throw unsafe();
  return 'preserve';
}

/** Resolve the package-controlled starter, independently of workflow test overrides. */
export function readSetupVerificationActionStarter(): string {
  return fs.readFileSync(join(__dirname, '..', '..', 'setup/actions/copilot-verification-setup/action.yml'), 'utf8');
}

/** Exclusive creation cannot truncate a file that wins the Apply race. */
export function createSetupVerificationAction(root: string, expected?: SetupVerificationActionState): { copied: number; skipped: number } {
  const state = inspectSetupVerificationActionPath(root);
  if (expected && expected !== state) throw stale();
  if (state === 'preserve') return { copied: 0, skipped: 1 };
  const content = readSetupVerificationActionStarter();
  const absoluteRoot = fs.realpathSync(root);
  const previousDirectory = fs.realpathSync('.');
  // Node has no portable openat. Pin each validated directory as the OS cwd,
  // then use only single-component relative operations. On POSIX this retains
  // the directory even if renamed; Windows locks the current directory.
  // This critical section is synchronous: never await or invoke user callbacks
  // here. The installer owns this main-thread section and always restores cwd.
  try {
    enterPinnedDirectory(absoluteRoot);
    for (const segment of ['.github', 'actions', 'copilot-verification-setup']) {
      try { fs.mkdirSync(segment); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      enterPinnedDirectory(segment);
    }
    // Detect a relocated route before creation as well as after writing. A
    // replacement after this check cannot redirect the cwd-relative open.
    inspectSetupVerificationActionPath(absoluteRoot);
    writeStarterInPinnedDirectory(absoluteRoot, content);
  } finally { process.chdir(previousDirectory); }
  return { copied: 1, skipped: 0 };
}

function enterPinnedDirectory(path: string): void {
  let descriptor: number;
  try { descriptor = fs.openSync(path, directoryFlags); }
  catch (error) {
    if (['ELOOP', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code!)) throw unsafe();
    throw error;
  }
  try {
    // Keep the directory handle open until cwd is pinned, preventing inode reuse.
    const bound = fs.fstatSync(descriptor, { bigint: true });
    const observed = fs.lstatSync(path, { bigint: true });
    if (!bound.isDirectory() || !observed.isDirectory() || observed.isSymbolicLink()) throw unsafe();
    if (!sameDirectory(bound, observed)) throw stale();
    process.chdir(path);
    if (!sameDirectory(bound, fs.lstatSync('.', { bigint: true }))) throw stale();
  } finally { fs.closeSync(descriptor); }
}

function writeStarterInPinnedDirectory(root: string, content: string): void {
  const destination = 'action.yml';
  let descriptor: number;
  try { descriptor = fs.openSync(destination, 'wx', 0o644); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw stale(); throw error; }
  let created: fs.BigIntStats | undefined;
  try {
    try {
      created = fs.fstatSync(descriptor, { bigint: true }); fs.writeFileSync(descriptor, content, 'utf8');
      if (inspectSetupVerificationActionPath(root) !== 'preserve') throw stale();
      if (!sameDirectory(fs.lstatSync('.', { bigint: true }), fs.lstatSync(join(root, SETUP_VERIFICATION_ACTION_PARENTS[2]), { bigint: true }))) throw stale();
    }
    finally { fs.closeSync(descriptor); }
  }
  catch (error) {
    // Remove only our incomplete file, never a concurrent replacement.
    try {
      const current = entry(destination);
      if (created && current?.dev === created.dev && current.ino === created.ino) fs.unlinkSync(destination);
    } catch { /* Preserve the original failure; an incomplete asset needs inspection. */ }
    throw error;
  }
}
