import fs from 'node:fs';
import { join } from 'node:path';
import { nativeSession, readNativeRecord, writeNativeRecord } from '../native_verification_protocol';
import { verificationCandidateIdentity } from '../native_verification_candidate';
import { stageNativeVerificationAction, restoreNativeVerificationAction } from '../native_verification_overlay';
import { nativeVerificationFixture } from './native_verification_fixture';

describe('native session provenance and filesystem contracts', () => {
    let f: ReturnType<typeof nativeVerificationFixture>;
    beforeEach(() => { f = nativeVerificationFixture(); });
    afterEach(() => { jest.restoreAllMocks(); f.cleanup(); });
    it('reads atomically published operation records and absent records', () => {
        writeNativeRecord(f.session, 'record.json', { value: 42 }); expect(readNativeRecord(f.session, 'record.json')).toEqual({ value: 42 });
        expect(readNativeRecord(f.session, 'absent.json')).toBeUndefined(); expect(nativeSession(f.session).pid).toBe(process.pid);
    });
    it.each(['run', 'attempt', 'job', 'workspace', 'pid', 'schemaVersion'])('rejects a session with mismatched %s', field => {
        const session = nativeSession(f.session); writeNativeRecord(f.session, 'session.json', { ...session, [field]: 'other' });
        expect(() => nativeSession(f.session)).toThrow('handoff-invalid');
    });
    it('rejects missing sessions', () => {
        fs.rmSync(join(f.session, 'session.json')); expect(() => nativeSession(f.session)).toThrow('handoff-invalid');
    });
    it('rejects arbitrary ticket roots before reading or cleaning them', () => {
        expect(() => nativeSession(f.root)).toThrow('handoff-invalid');
    });
    it('rejects writable operation directories on POSIX', () => {
        if (process.platform === 'win32') return;
        fs.chmodSync(f.session, 0o777); expect(() => nativeSession(f.session)).toThrow('handoff-invalid'); fs.chmodSync(f.session, 0o700);
    });
    it.each(['oversize', 'directory', 'hardlink', 'invalid-json'])('rejects %s records', kind => {
        const file = join(f.session, 'record.json');
        if (kind === 'directory') fs.mkdirSync(file);
        else if (kind === 'hardlink') { fs.writeFileSync(join(f.session, 'original'), '{}'); fs.linkSync(join(f.session, 'original'), file); }
        else fs.writeFileSync(file, kind === 'oversize' ? 'x'.repeat(16_385) : 'not json');
        expect(() => readNativeRecord(f.session, 'record.json')).toThrow('handoff-invalid');
    });
    it('rejects replaced records before consuming their content', () => {
        writeNativeRecord(f.session, 'record.json', {}); const original = fs.fstatSync;
        jest.spyOn(fs, 'fstatSync').mockImplementation(((fd: number, options: {bigint: true}) => ({ ...original(fd, options), ino: 0n })) as typeof fs.fstatSync);
        expect(() => readNativeRecord(f.session, 'record.json')).toThrow('handoff-invalid');
    });
    it('restores originals on explicit cancellation and makes cleanup idempotent', () => {
        fs.mkdirSync(f.action, { recursive: true }); fs.writeFileSync(join(f.action, 'action.yml'), 'original');
        stageNativeVerificationAction(f.setup as never, f.session); restoreNativeVerificationAction(f.session, f.root); restoreNativeVerificationAction(f.session, f.root);
        expect(fs.readFileSync(join(f.action, 'action.yml'), 'utf8')).toBe('original');
    });
    it('rejects unsafe action ancestors', () => {
        fs.writeFileSync(join(f.root, '.github'), 'file');
        expect(() => stageNativeVerificationAction(f.setup as never, f.session)).toThrow('helper-invalid');
    });
    it('rejects a non-directory action without overwriting it', () => {
        fs.mkdirSync(join(f.root, '.github/actions'), { recursive: true }); fs.writeFileSync(f.action, 'original');
        expect(() => stageNativeVerificationAction(f.setup as never, f.session)).toThrow('helper-invalid'); expect(fs.readFileSync(f.action, 'utf8')).toBe('original');
    });
    it('rejects malformed overlay recovery records without deleting candidate content', () => {
        writeNativeRecord(f.session, 'overlay.json', { target: '/other', backup: '/other', created: [] });
        expect(() => restoreNativeVerificationAction(f.session, f.root)).toThrow('handoff-invalid');
    });
    it('binds tracked contents, branch and staged content, not filesystem timestamps', () => {
        const before = verificationCandidateIdentity(f.root, f.runtime.environment);
        fs.utimesSync(join(f.root, 'manifest'), new Date(), new Date()); expect(verificationCandidateIdentity(f.root, f.runtime.environment)).toBe(before);
        f.git('checkout', '-b', 'other'); expect(verificationCandidateIdentity(f.root, f.runtime.environment)).not.toBe(before);
    });
    it('rejects excessive publishable untracked files', () => {
        for (let i = 0; i < 257; i++) fs.writeFileSync(join(f.root, `untracked-${i}`), 'x');
        expect(() => verificationCandidateIdentity(f.root, f.runtime.environment)).toThrow('candidate-changed');
    });
    it('binds untracked file content and links without following the link', () => {
        fs.writeFileSync(join(f.root, 'untracked'), 'one'); const before = verificationCandidateIdentity(f.root, f.runtime.environment);
        fs.writeFileSync(join(f.root, 'untracked'), 'two'); expect(verificationCandidateIdentity(f.root, f.runtime.environment)).not.toBe(before);
    });
});
