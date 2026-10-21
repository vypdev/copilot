import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { load } from 'js-yaml';
import { createSetupVerificationAction, inspectSetupVerificationActionPath, readSetupVerificationActionStarter } from '../setup_verification_action';
import { SETUP_VERIFICATION_ACTION_PATH as asset, SETUP_VERIFICATION_ACTION_PARENTS as parents } from '../../domain/setup_verification_action';
import { copySetupFiles, ensureGitHubDirs } from '../../utils/setup_files';
import { inspectSetupInstallation } from '../../utils/setup_installation_review';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';

jest.mock('../../utils/logger', () => ({ logInfo: jest.fn() }));
describe('create-once consumer verification action', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(join(tmpdir(), 'copilot-verification-onboarding-')); });
  afterEach(() => { jest.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
  function existing(content: string | Buffer = 'project-owned\r\n') {
    const file = join(root, asset); fs.mkdirSync(dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file;
  }
  test('VSO-01 inspection of an absent path creates no directories', () => {
    expect(inspectSetupVerificationActionPath(root)).toBe('create'); expect(fs.readdirSync(root)).toEqual([]);
  });
  test('VSO-01 writes the packaged starter exactly once and is idempotent', () => {
    expect(createSetupVerificationAction(root, 'create')).toEqual({ copied: 1, skipped: 0 });
    expect(fs.readFileSync(join(root, asset), 'utf8')).toBe(readSetupVerificationActionStarter());
    expect(createSetupVerificationAction(root)).toEqual({ copied: 0, skipped: 1 });
  });
  test('VSO-02 preserves arbitrary bytes without decoding the consumer action', () => {
    const bytes = Buffer.from([0xff, 0, 0x0d, 0x0a]); const file = existing(bytes);
    expect(createSetupVerificationAction(root, 'preserve')).toEqual({ copied: 0, skipped: 1 });
    expect(fs.readFileSync(file)).toEqual(bytes);
  });
  test('VSO-02 does not read the existing action or traverse its auxiliary files', () => {
    existing(); const read = jest.spyOn(fs, 'readFileSync');
    expect(inspectSetupVerificationActionPath(root)).toBe('preserve'); createSetupVerificationAction(root);
    expect(read).not.toHaveBeenCalled();
  });
  test('VSO-02 retains project auxiliaries when creating an absent entrypoint', () => {
    const auxiliary = join(root, parents[2], 'bootstrap.sh'); fs.mkdirSync(dirname(auxiliary), { recursive: true }); fs.writeFileSync(auxiliary, 'custom\r\n');
    createSetupVerificationAction(root); expect(fs.readFileSync(auxiliary, 'utf8')).toBe('custom\r\n');
  });
  test.each(parents)('VSO-08 blocks a regular-file parent at %s before creating anything', parent => {
    const collision = join(root, parent); fs.mkdirSync(dirname(collision), { recursive: true }); fs.writeFileSync(collision, 'retain');
    expect(() => createSetupVerificationAction(root)).toThrow('real parent directories');
    expect(fs.readFileSync(collision, 'utf8')).toBe('retain');
  });
  test.each(parents)('VSO-08 does not follow a symlink/junction at %s', parent => {
    const external = join(root, 'external'); fs.mkdirSync(external); fs.writeFileSync(join(external, 'keep'), 'retain');
    const link = join(root, parent); fs.mkdirSync(dirname(link), { recursive: true }); fs.symlinkSync(external, link, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => ensureGitHubDirs(root)).toThrow('real parent directories');
    expect(() => createSetupVerificationAction(root)).toThrow('real parent directories');
    expect(fs.readdirSync(external)).toEqual(['keep']);
  });
  test('VSO-08 blocks a directory collision at action.yml', () => {
    fs.mkdirSync(join(root, asset), { recursive: true });
    expect(() => createSetupVerificationAction(root)).toThrow('regular action file'); expect(fs.statSync(join(root, asset)).isDirectory()).toBe(true);
  });
  test.each(['dangling', 'existing'] as const)('VSO-08 rejects a %s target link without reading or replacing it', kind => {
    existing(); fs.unlinkSync(join(root, asset));
    const inspect = jest.spyOn(fs, 'lstatSync'); const real = inspect.getMockImplementation()!;
    inspect.mockImplementation(((path: fs.PathLike, ...args: unknown[]) => String(path) === join(root, asset)
      ? { isFile: () => kind === 'existing', isDirectory: () => false, isSymbolicLink: () => true }
      : Reflect.apply(real, fs, [path, ...args])) as typeof fs.lstatSync);
    expect(() => createSetupVerificationAction(root)).toThrow('regular action file');
  });
  test('VSO-09 refuses a file created after the reviewed missing state', () => {
    expect(inspectSetupVerificationActionPath(root)).toBe('create'); const file = existing('new human action');
    expect(() => createSetupVerificationAction(root, 'create')).toThrow('changed after review');
    expect(fs.readFileSync(file, 'utf8')).toBe('new human action');
  });
  test('VSO-09 refuses to recreate an action removed after a preserve plan', () => {
    existing(); expect(inspectSetupVerificationActionPath(root)).toBe('preserve'); fs.unlinkSync(join(root, asset));
    expect(() => createSetupVerificationAction(root, 'preserve')).toThrow('changed after review'); expect(fs.existsSync(join(root, asset))).toBe(false);
  });
  test('VSO-09 exclusive opening preserves the winner of the final create race', () => {
    const open = jest.spyOn(fs, 'openSync'); const real = open.getMockImplementation()!;
    open.mockImplementation(((path: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      if (String(path) === join(root, asset)) existing('race winner');
      return real(path, flags, mode);
    }) as typeof fs.openSync);
    expect(() => createSetupVerificationAction(root)).toThrow('changed after review');
    expect(fs.readFileSync(join(root, asset), 'utf8')).toBe('race winner');
  });
  test('VSO-08 rechecks a parent that changes while its directory is created', () => {
    const make = jest.spyOn(fs, 'mkdirSync'); const real = make.getMockImplementation()!;
    make.mockImplementation(((path: fs.PathLike) => {
      if (String(path) === join(root, parents[1])) { fs.writeFileSync(path, 'collision'); throw Object.assign(new Error('exists'), { code: 'EEXIST' }); }
      return real(path);
    }) as typeof fs.mkdirSync);
    expect(() => createSetupVerificationAction(root)).toThrow('real parent directories');
    expect(fs.readFileSync(join(root, parents[1]), 'utf8')).toBe('collision');
  });
  test('VSO-08 propagates an inspection permission failure rather than treating it as absent', () => {
    const failure = Object.assign(new Error('fixture denied'), { code: 'EACCES' }); jest.spyOn(fs, 'lstatSync').mockImplementation(() => { throw failure; });
    expect(() => createSetupVerificationAction(root)).toThrow(failure);
  });
  test('VSO-08 propagates directory creation errors without claiming success', () => {
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => { throw Object.assign(new Error('fixture denied'), { code: 'EACCES' }); });
    expect(() => createSetupVerificationAction(root)).toThrow('fixture denied'); expect(fs.readdirSync(root)).toEqual([]);
  });
  test('VSO-08 propagates exclusive-open failures without producing a partial file', () => {
    jest.spyOn(fs, 'openSync').mockImplementation(() => { throw Object.assign(new Error('fixture denied'), { code: 'EACCES' }); });
    expect(() => createSetupVerificationAction(root)).toThrow('fixture denied'); expect(fs.existsSync(join(root, asset))).toBe(false);
  });
  test('VSO-08 removes its own incomplete starter and closes the descriptor after a write failure', () => {
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('fixture full disk'); }); const close = jest.spyOn(fs, 'closeSync');
    expect(() => createSetupVerificationAction(root)).toThrow('fixture full disk');
    expect(fs.existsSync(join(root, asset))).toBe(false); expect(close).toHaveBeenCalled();
  });
  test('VSO-08 closes the descriptor when file metadata cannot be established', () => {
    const failure = new Error('fixture metadata failure'); const close = jest.spyOn(fs, 'closeSync');
    jest.spyOn(fs, 'fstatSync').mockImplementation(() => { throw failure; });
    expect(() => createSetupVerificationAction(root)).toThrow(failure); expect(close).toHaveBeenCalled();
  });
  test('VSO-08 retains the original write error when partial-file cleanup is denied', () => {
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('fixture full disk'); });
    jest.spyOn(fs, 'unlinkSync').mockImplementation(() => { throw new Error('fixture cleanup denied'); });
    expect(() => createSetupVerificationAction(root)).toThrow('fixture full disk'); expect(fs.existsSync(join(root, asset))).toBe(true);
  });
  test('VSO-09 failed-write cleanup never deletes a concurrent replacement', () => {
    const write = jest.spyOn(fs, 'writeFileSync'); const realWrite = write.getMockImplementation()!;
    write.mockImplementation(((file: fs.PathOrFileDescriptor, content: string) => {
      if (typeof file === 'number') {
        fs.renameSync(join(root, asset), join(root, 'incomplete'));
        realWrite(join(root, asset), 'replacement'); throw new Error('fixture write failure');
      }
      return realWrite(file, content);
    }) as typeof fs.writeFileSync);
    expect(() => createSetupVerificationAction(root)).toThrow('fixture write failure'); expect(fs.readFileSync(join(root, asset), 'utf8')).toBe('replacement');
  });
  test('VSO-03 starter is a single native composite with no successful no-op or inferred dependencies', () => {
    const parsed = load(readSetupVerificationActionStarter()) as { runs: { using: string; steps: { shell: string; run: string }[] } };
    expect(parsed.runs.using).toBe('composite'); expect(parsed.runs.steps).toHaveLength(1); expect(parsed.runs.steps[0].shell).toBe('bash');
    expect(parsed.runs.steps[0].run).toContain('exit 1'); expect(parsed.runs.steps[0].run).not.toMatch(/npm install|pip install|setup-node|setup-java/u);
  });
  test('VSO-03 executes the placeholder with an actionable failure', () => {
    const parsed = load(readSetupVerificationActionStarter()) as { runs: { steps: { run: string }[] } };
    try { execFileSync('bash', ['-c', parsed.runs.steps[0].run], { encoding: 'utf8', stdio: 'pipe' }); throw new Error('placeholder succeeded'); }
    catch (error) {
      const result = error as { status?: number; stdout?: string }; expect(result.status).toBe(1);
      expect(String(result.stdout)).toContain('Configure .github/actions/copilot-verification-setup/action.yml'); expect(String(result.stdout)).toContain('MAIN_BRANCH');
    }
  });
  test('VSO-01 disabled setup still plans creation without writing', () => {
    const review = inspectSetupInstallation(root, createDefaultSetupConfiguration());
    expect(review.verificationSetup).toMatchObject({ action: 'create', enabled: false });
    expect(review.changes).toContainEqual({ path: asset, before: null, after: readSetupVerificationActionStarter() }); expect(fs.readdirSync(root)).toEqual([]);
  });
  test('VSO-02 enabled review preserves consumer content without exposing it in the diff', () => {
    const file = existing('PRIVATE CUSTOM CONTENT'); const config = createDefaultSetupConfiguration(); config.repository.verificationSetup = true;
    const review = inspectSetupInstallation(root, config);
    expect(review.verificationSetup).toMatchObject({ action: 'preserve', enabled: true }); expect(review.changes.some(change => change.path === asset)).toBe(false);
    expect(JSON.stringify(review)).not.toContain('PRIVATE CUSTOM CONTENT'); expect(fs.readFileSync(file, 'utf8')).toBe('PRIVATE CUSTOM CONTENT');
  });
  test('VSO-08 unsafe path is an actionable plan blocker before any workflow is inspected', () => {
    fs.writeFileSync(join(root, '.github'), 'collision');
    const review = inspectSetupInstallation(root, createDefaultSetupConfiguration());
    expect(review.verificationSetup?.action).toBe('blocked'); expect(review.blockers[0]).toContain('Inspect the path'); expect(review.changes).toEqual([]);
  });
  test('VSO-13 initial install, repeated workflow upgrades and deselection never take consumer ownership', () => {
    const config = createDefaultSetupConfiguration(); ensureGitHubDirs(root);
    copySetupFiles(root, undefined, config.features, { setupConfiguration: config });
    const file = existing('customized\r\n'); const auxiliary = join(root, parents[2], 'extra'); fs.writeFileSync(auxiliary, 'retain');
    config.repository.verificationSetup = false;
    copySetupFiles(root, undefined, config.features, { setupConfiguration: config, updateExistingWorkflows: true });
    expect(fs.readFileSync(file, 'utf8')).toBe('customized\r\n'); expect(fs.readFileSync(auxiliary, 'utf8')).toBe('retain');
    expect(fs.readFileSync(join(root, '.copilot/setup-manifest.json'), 'utf8')).not.toContain(asset);
  });
});
