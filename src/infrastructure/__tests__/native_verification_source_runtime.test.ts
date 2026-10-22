import fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanupNativeSourceRuntime } from '../native_verification_source_runtime';
const {prepareNativeSourceAction} = require('../../../scripts/prepare-native-source-action.cjs') as {prepareNativeSourceAction(root: string, fixture?: boolean): string};

describe('immutable source Action runtime snapshot', () => {
    let container: string; let workspace: string;
    beforeEach(() => {
        container = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'copilot-source-action-'))); workspace = join(container, 'workspace');
        fs.mkdirSync(join(workspace, 'build/github_action'), {recursive: true}); fs.writeFileSync(join(workspace, 'action.yml'), 'runs: {using: node24, main: build/github_action/index.js}');
        fs.writeFileSync(join(workspace, 'build/github_action/index.js'), 'original');
    });
    afterEach(() => { jest.restoreAllMocks(); fs.rmSync(container, {recursive: true, force: true}); });
    it('captures the manifest and runtime outside the mutable candidate', () => {
        const root = prepareNativeSourceAction(workspace); fs.writeFileSync(join(workspace, 'build/github_action/index.js'), 'candidate');
        expect(root).toBe(join(container, '.copilot-native-runtime')); expect(fs.readFileSync(join(root, 'build/github_action/index.js'), 'utf8')).toBe('original');
        cleanupNativeSourceRuntime(root, workspace); expect(fs.existsSync(root)).toBe(false); cleanupNativeSourceRuntime(root, workspace);
    });
    it('replaces an owned stale snapshot and preserves setup assets', () => {
        fs.mkdirSync(join(workspace, 'setup')); fs.writeFileSync(join(workspace, 'setup/file.yml'), 'asset'); const root = prepareNativeSourceAction(workspace);
        fs.writeFileSync(join(workspace, 'build/github_action/index.js'), 'reviewed-new-version'); prepareNativeSourceAction(workspace);
        expect(fs.readFileSync(join(root, 'build/github_action/index.js'), 'utf8')).toBe('reviewed-new-version'); expect(fs.readFileSync(join(root, 'setup/file.yml'), 'utf8')).toBe('asset');
    });
    it('supports the native CI fixture with the same isolation contract', () => {
        const source = join(workspace, '.github/actions/copilot-native-fixture'); fs.mkdirSync(join(source, 'dist'), {recursive: true});
        fs.writeFileSync(join(source, 'action.yml'), 'fixture'); fs.writeFileSync(join(source, 'dist/index.js'), 'fixture-code');
        const root = prepareNativeSourceAction(workspace, true); expect(fs.readFileSync(join(root, 'dist/index.js'), 'utf8')).toBe('fixture-code'); cleanupNativeSourceRuntime(root, workspace);
    });
    it('refuses to overwrite an unrelated directory', () => {
        fs.mkdirSync(join(container, '.copilot-native-runtime')); fs.writeFileSync(join(container, '.copilot-native-runtime/keep'), 'original');
        expect(() => prepareNativeSourceAction(workspace)).toThrow('not owned'); expect(fs.readFileSync(join(container, '.copilot-native-runtime/keep'), 'utf8')).toBe('original');
    });
    it('refuses a receipt from another workspace', () => {
        const root = prepareNativeSourceAction(workspace); fs.writeFileSync(join(root, '.copilot-runtime-snapshot.json'), JSON.stringify({kind: 'copilot-native-runtime', workspace: 'other'}));
        expect(() => prepareNativeSourceAction(workspace)).toThrow('ownership'); expect(() => cleanupNativeSourceRuntime(root, workspace)).toThrow('handoff-invalid');
    });
    it('rejects unsafe source assets and cleanup paths', () => {
        fs.rmSync(join(workspace, 'build/github_action/index.js')); fs.mkdirSync(join(workspace, 'build/github_action/index.js'));
        expect(() => prepareNativeSourceAction(workspace)).toThrow('regular file'); expect(() => cleanupNativeSourceRuntime(workspace, workspace)).toThrow('handoff-invalid');
    });
});
