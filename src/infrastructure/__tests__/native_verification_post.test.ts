import { verificationExecutable } from '../verification_executable';
import fs from 'node:fs';
import { join } from 'node:path';
import * as core from '@actions/core';
import { runNativeVerificationEntry } from '../native_verification_controller';
import { captureVerificationSetupAtCommit, verificationSetupDigest } from '../verification_setup_snapshot';
import { stageNativeVerificationAction } from '../native_verification_staging';
import { nativeVerificationFixture, COMPOSITE } from './native_verification_fixture';

jest.mock('@actions/core', () => ({getState: jest.fn(), saveState: jest.fn(), setOutput: jest.fn(), setFailed: jest.fn(), setSecret: jest.fn()}));

describe('trusted snapshot during native post phases', () => {
    let f: ReturnType<typeof nativeVerificationFixture>; let source: string; let digest: string; let gitPath: string;
    beforeEach(() => {
        f = nativeVerificationFixture(); gitPath = verificationExecutable('git', f.runtime.environment); fs.mkdirSync(f.action, {recursive: true}); fs.writeFileSync(join(f.action, 'action.yml'), COMPOSITE);
        f.git('add', '.'); f.git('commit', '-m', 'reviewed source'); source = f.git('rev-parse', 'HEAD');
        const snapshot = captureVerificationSetupAtCommit(source, f.root); if (snapshot.kind !== 'ready') throw new Error('snapshot');
        digest = verificationSetupDigest(snapshot); stageNativeVerificationAction(snapshot, f.session);
        jest.mocked(core.getState).mockImplementation(key => ({'copilot-native-post': 'true', 'native-verification-ticket': f.session,
            'native-verification-source': source, 'native-verification-git': gitPath, 'native-verification-digest': digest}[key] ?? ''));
    });
    afterEach(() => { jest.restoreAllMocks(); f.cleanup(); });
    it('keeps trusted composite metadata available for deferred post steps without replaying the operation', async () => {
        fs.writeFileSync(join(f.action, 'action.yml'), 'candidate'); fs.writeFileSync(join(f.staged, 'action.yml'), 'tampered staging');
        const run = jest.fn(); await runNativeVerificationEntry(run);
        expect(run).not.toHaveBeenCalled(); expect(fs.readFileSync(join(f.staged, 'action.yml'), 'utf8')).toBe(COMPOSITE);
        expect(fs.readFileSync(join(f.action, 'action.yml'), 'utf8')).toBe('candidate');
    });
    it('rereads the original commit rather than a later candidate or moved branch', async () => {
        fs.writeFileSync(join(f.action, 'action.yml'), 'runs: {using: composite, steps: [{run: "exit 99", shell: bash}]}');
        f.git('add', '.'); f.git('commit', '-m', 'candidate'); f.git('update-ref', 'refs/remotes/origin/main', f.git('rev-parse', 'HEAD'));
        await runNativeVerificationEntry(jest.fn()); expect(fs.readFileSync(join(f.staged, 'action.yml'), 'utf8')).toBe(COMPOSITE);
    });
    it('pins Git before native PATH changes instead of executing a tool supplied by the candidate', async () => {
        const before = process.env.PATH;
        try { process.env.PATH = f.root; await runNativeVerificationEntry(jest.fn()); }
        finally { process.env.PATH = before; }
        expect(fs.readFileSync(join(f.staged, 'action.yml'), 'utf8')).toBe(COMPOSITE);
    });
    it('removes executable staging before failing a mismatched original content digest', async () => {
        digest = '0'.repeat(64); await expect(runNativeVerificationEntry(jest.fn())).rejects.toThrow('helper-invalid'); expect(fs.existsSync(f.staged)).toBe(false);
    });
    it('removes executable staging when pinned source objects are unavailable', async () => {
        source = '0'.repeat(40); await expect(runNativeVerificationEntry(jest.fn())).rejects.toThrow('helper-invalid'); expect(fs.existsSync(f.staged)).toBe(false);
    });
});
