import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSetupPublisherProposalFile, SetupPublisherProposalFileError } from '../setup_publisher_proposal_file';
import { SETUP_PUBLISHER_PROPOSAL_MAX_BYTES, SETUP_PUBLISHER_WORKFLOW_PATH } from '../../domain/setup_publisher_installation';

jest.mock('node:fs', () => {
  const actual = jest.requireActual<typeof import('node:fs')>('node:fs');
  return { ...actual, constants: { ...actual.constants }, lstatSync: jest.fn(actual.lstatSync),
    openSync: jest.fn(actual.openSync), fstatSync: jest.fn(actual.fstatSync), readSync: jest.fn(actual.readSync), closeSync: jest.fn(actual.closeSync) };
});
const actual = jest.requireActual<typeof import('node:fs')>('node:fs');
let root: string, file: string;
function proposal() {
  return { schemaVersion: 1, kind: 'review-only-publisher-installation-proposal',
    destination: { repository: 'owner/project', repositoryId: 42, defaultBranch: 'main', head: '1'.repeat(40) },
    path: SETUP_PUBLISHER_WORKFLOW_PATH, baseline: 'Readable absence',
    source: { repository: 'vypdev/copilot', commit: '2'.repeat(40), pullRequest: 989, merged: false,
      maintainerApproval: 'Review observation only', workflowSha256: 'a'.repeat(64), actionManifestSha256: 'b'.repeat(64), actionBundleSha256: 'c'.repeat(64) },
    proposedWorkflowSha256: 'd'.repeat(64), sourceChange: 'Configuración segura 😀', consumerTemplatesChanged: false,
    productionVerification: 'disabled', installationAuthorized: false, installedDestinationSha: null,
    nativeCanary: { status: 'not-run', explicitlyAuthorizedPullRequest: null, runId: null }, dependency: 976, coordination: 814 };
}
beforeEach(() => {
  jest.mocked(fs.lstatSync).mockReset().mockImplementation((...args) => Reflect.apply(actual.lstatSync, actual, args));
  jest.mocked(fs.openSync).mockReset().mockImplementation((...args) => Reflect.apply(actual.openSync, actual, args));
  jest.mocked(fs.fstatSync).mockReset().mockImplementation((...args) => Reflect.apply(actual.fstatSync, actual, args));
  jest.mocked(fs.readSync).mockReset().mockImplementation((...args) => Reflect.apply(actual.readSync, actual, args));
  jest.mocked(fs.closeSync).mockReset().mockImplementation((...args) => Reflect.apply(actual.closeSync, actual, args));
  Object.assign(fs.constants, actual.constants);
  root = fs.mkdtempSync(join(tmpdir(), 'publisher-proposal-input-')); file = join(root, 'propuesta 😀.json');
  fs.writeFileSync(file, JSON.stringify(proposal()));
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
function closed(): void {
  expect(fs.closeSync).toHaveBeenCalledTimes(1);
  const fd = jest.mocked(fs.closeSync).mock.calls[0][0];
  expect(() => actual.fstatSync(fd)).toThrow();
}

it('reads one regular strict UTF8 proposal and closes its actual descriptor', () => {
  expect(readSetupPublisherProposalFile(file)).toEqual(proposal()); closed();
});
it('accepts exactly128KiB without treating character count as byte count', () => {
  const text = JSON.stringify(proposal());
  fs.writeFileSync(file, text + ' '.repeat(SETUP_PUBLISHER_PROPOSAL_MAX_BYTES - Buffer.byteLength(text)));
  expect(readSetupPublisherProposalFile(file)).toEqual(proposal()); closed();
});
it('rejects oversized metadata before opening or reading the file', () => {
  fs.writeFileSync(file, Buffer.alloc(SETUP_PUBLISHER_PROPOSAL_MAX_BYTES + 1, 32));
  expect(() => readSetupPublisherProposalFile(file)).toThrow(new SetupPublisherProposalFileError('too-large'));
  expect(fs.openSync).not.toHaveBeenCalled(); expect(fs.readSync).not.toHaveBeenCalled(); expect(fs.closeSync).not.toHaveBeenCalled();
});
it.each(['missing', 'directory', 'symlink'])('refuses %s input before reading any proposal bytes', kind => {
  let source = file;
  if (kind === 'missing') source = join(root, 'missing');
  if (kind === 'directory') source = root;
  if (kind === 'symlink') { source = join(root, 'link.json'); fs.symlinkSync(file, source); }
  expect(() => readSetupPublisherProposalFile(source)).toThrow(new SetupPublisherProposalFileError(kind === 'missing' ? 'unavailable' : 'not-regular'));
  expect(fs.openSync).not.toHaveBeenCalled(); expect(fs.readSync).not.toHaveBeenCalled();
});
it.each([Buffer.from([0xff]), Buffer.from([0xc3]), Buffer.from([0xe2, 0x28, 0xa1])])('rejects malformed UTF8 without replacement decoding', bytes => {
  fs.writeFileSync(file, bytes);
  expect(() => readSetupPublisherProposalFile(file)).toThrow(new SetupPublisherProposalFileError('invalid-utf8')); closed();
});
it.each(['', '{', '\ufeff{}', 'secret-value-that-must-not-be-echoed'])('normalizes invalid JSON diagnostics without echoing input: %j', text => {
  fs.writeFileSync(file, text);
  expect(() => readSetupPublisherProposalFile(file)).toThrow(new SetupPublisherProposalFileError('invalid-json')); closed();
});
it.each([[], null, { ...proposal(), token: 'secret-value-that-must-not-be-echoed' }, { ...proposal(), installationAuthorized: true }])(
  'rejects unsupported closed-schema input without leaking its content', value => {
    fs.writeFileSync(file, JSON.stringify(value));
    expect(() => readSetupPublisherProposalFile(file)).toThrow(new SetupPublisherProposalFileError('unsupported')); closed();
  },
);
it('detects a replacement between lstat and opening the descriptor', () => {
  const replacement = join(root, 'replacement'); fs.writeFileSync(replacement, JSON.stringify(proposal()));
  jest.mocked(fs.openSync).mockImplementationOnce((...args) => { fs.renameSync(replacement, file); return Reflect.apply(actual.openSync, actual, args); });
  expect(() => readSetupPublisherProposalFile(file)).toThrow(new SetupPublisherProposalFileError('changed'));
  expect(fs.readSync).not.toHaveBeenCalled(); closed();
});
it('detects a link swap at open with the native no-follow flag', () => {
  const target = join(root, 'target'); fs.writeFileSync(target, JSON.stringify(proposal()));
  jest.mocked(fs.openSync).mockImplementationOnce((...args) => {
    fs.unlinkSync(file); fs.symlinkSync(target, file); return Reflect.apply(actual.openSync, actual, args);
  });
  expect(() => readSetupPublisherProposalFile(file)).toThrow(new SetupPublisherProposalFileError('not-regular'));
  expect(fs.readSync).not.toHaveBeenCalled(); expect(fs.closeSync).not.toHaveBeenCalled();
});
it('models unavailable no-follow flags and still rejects a same-inode link before reading bytes', () => {
  Object.assign(fs.constants, { O_NOFOLLOW: undefined, O_NONBLOCK: undefined });
  const target = join(root, 'retained-original');
  jest.mocked(fs.openSync).mockImplementationOnce((...args) => {
    fs.renameSync(file, target); fs.symlinkSync(target, file); return Reflect.apply(actual.openSync, actual, args);
  });
  expect(() => readSetupPublisherProposalFile(file)).toThrow(new SetupPublisherProposalFileError('changed'));
  expect(fs.readSync).not.toHaveBeenCalled(); closed();
});
it('bounds a file that grows immediately after the pre-read metadata check', () => {
  let calls = 0;
  jest.mocked(fs.lstatSync).mockImplementation((...args) => {
    const info = Reflect.apply(actual.lstatSync, actual, args);
    if (++calls === 2) fs.appendFileSync(file, Buffer.alloc(SETUP_PUBLISHER_PROPOSAL_MAX_BYTES, 32));
    return info;
  });
  expect(() => readSetupPublisherProposalFile(file)).toThrow(new SetupPublisherProposalFileError('too-large'));
  expect(jest.mocked(fs.readSync).mock.calls.every(call => Number((call as readonly unknown[])[3]) <= SETUP_PUBLISHER_PROPOSAL_MAX_BYTES + 1)).toBe(true); closed();
});
it('detects a path replacement after the bounded descriptor read', () => {
  const replacement = join(root, 'replacement'); fs.writeFileSync(replacement, JSON.stringify(proposal())); let calls = 0;
  jest.mocked(fs.lstatSync).mockImplementation((...args) => {
    if (++calls === 3) fs.renameSync(replacement, file);
    return Reflect.apply(actual.lstatSync, actual, args);
  });
  expect(() => readSetupPublisherProposalFile(file)).toThrow(new SetupPublisherProposalFileError('changed')); closed();
});
it.each(['file type', 'dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'])(
  'refuses changed descriptor metadata: %s', field => {
    const initial = actual.lstatSync(file, { bigint: true });
    const altered = field === 'file type' ? actual.lstatSync(root, { bigint: true }) : Object.assign(Object.create(initial),
      { [field]: initial[field as 'dev' | 'ino' | 'size' | 'mtimeNs' | 'ctimeNs'] + BigInt(1) });
    jest.mocked(fs.fstatSync).mockReturnValueOnce(altered as ReturnType<typeof fs.fstatSync>);
    expect(() => readSetupPublisherProposalFile(file)).toThrow(new SetupPublisherProposalFileError('changed'));
    expect(fs.readSync).not.toHaveBeenCalled(); closed();
  },
);
it('rejects descriptor changes found after the read even when its bytes form valid JSON', () => {
  let calls = 0;
  jest.mocked(fs.fstatSync).mockImplementation((...args) => {
    if (++calls === 2) fs.appendFileSync(file, ' ');
    return Reflect.apply(actual.fstatSync, actual, args);
  });
  expect(() => readSetupPublisherProposalFile(file)).toThrow(new SetupPublisherProposalFileError('changed')); closed();
});
it('closes the descriptor after a read error without exposing provider text', () => {
  jest.mocked(fs.readSync).mockImplementationOnce(() => { throw Object.assign(new Error('secret-value'), { code: 'EIO' }); });
  expect(() => readSetupPublisherProposalFile(file)).toThrow(new SetupPublisherProposalFileError('unavailable')); closed();
});
it('normalizes close failures while actually closing its owned descriptor', () => {
  jest.mocked(fs.closeSync).mockImplementationOnce(fd => { actual.closeSync(fd); throw new Error('secret-value'); });
  expect(() => readSetupPublisherProposalFile(file)).toThrow(new SetupPublisherProposalFileError('unavailable')); closed();
});
