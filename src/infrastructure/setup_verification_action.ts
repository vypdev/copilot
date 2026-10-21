import * as fs from 'node:fs';
import { join } from 'node:path';
import { SETUP_VERIFICATION_ACTION_PATH, SETUP_VERIFICATION_ACTION_PARENTS, type SetupVerificationActionState } from '../domain/setup_verification_action';

const unsafe = () => new Error(`${SETUP_VERIFICATION_ACTION_PATH}: setup requires real parent directories and a regular action file. Inspect the path and remove unsafe links or collisions, then review setup again. Existing contents were preserved.`);
const stale = () => new Error(`${SETUP_VERIFICATION_ACTION_PATH}: the path changed after review. No existing action was replaced. Review a fresh setup plan.`);
function entry(path: string): fs.Stats | undefined {
  try { return fs.lstatSync(path); }
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
  for (const parent of SETUP_VERIFICATION_ACTION_PARENTS) {
    const destination = join(root, parent);
    try { fs.mkdirSync(destination); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const info = fs.lstatSync(destination);
    if (!info.isDirectory() || info.isSymbolicLink()) throw unsafe();
  }
  inspectSetupVerificationActionPath(root);
  const destination = join(root, SETUP_VERIFICATION_ACTION_PATH);
  let descriptor: number;
  try { descriptor = fs.openSync(destination, 'wx', 0o644); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw stale(); throw error; }
  let created: fs.Stats | undefined;
  try {
    try { created = fs.fstatSync(descriptor); fs.writeFileSync(descriptor, content, 'utf8'); }
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
  return { copied: 1, skipped: 0 };
}
