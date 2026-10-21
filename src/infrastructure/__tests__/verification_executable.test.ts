import fs from 'node:fs';
import { join, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { verificationExecutable } from '../verification_executable';

describe('verification executable selection', () => {
    let root: string;
    beforeEach(() => { root = fs.mkdtempSync(join(tmpdir(), 'copilot-executable-')); });
    afterEach(() => { jest.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
    it('selects the executable from the isolated PATH rather than the worker PATH', () => {
        const binary = join(root, process.platform === 'win32' ? 'python.EXE' : 'python'); fs.writeFileSync(binary, 'fixture', {mode: 0o700});
        expect(verificationExecutable('python', {PATH: root})).toBe(binary);
    });
    it('preserves an explicit invocation path rather than resolving away virtual-environment links', () => {
        const binary = join(root, 'tool.exe'); fs.writeFileSync(binary, 'fixture', {mode: 0o700});
        expect(verificationExecutable(binary, {PATH: ''}, 'win32')).toBe(binary);
    });
    it('skips non-files and unavailable candidates without falling back to the host PATH', () => {
        fs.mkdirSync(join(root, process.platform === 'win32' ? 'node.EXE' : 'node')); expect(() => verificationExecutable('node', {PATH: root})).toThrow('isolated PATH');
    });
    it('honors Windows executable extensions', () => {
        const binary = join(root, 'pnpm.CMD'); fs.writeFileSync(binary, 'fixture', {mode: 0o700});
        expect(verificationExecutable('pnpm', {PATH: root, PATHEXT: '.EXE;.CMD'}, 'win32')).toBe(binary);
    });
    it('selects the Windows command shim rather than its extensionless Unix sibling', () => {
        fs.writeFileSync(join(root, 'pnpm'), 'Unix shell wrapper', {mode: 0o700}); fs.writeFileSync(join(root, 'pnpm.CMD'), 'Windows command wrapper', {mode: 0o700});
        expect(verificationExecutable('pnpm', {PATH: root, PATHEXT: '.EXE;.CMD'}, 'win32')).toBe(join(root, 'pnpm.CMD'));
    });
    it('supports the Windows default extension list', () => {
        const binary = join(root, 'tool.EXE'); fs.writeFileSync(binary, 'fixture', {mode: 0o700});
        expect(verificationExecutable('tool', {PATH: root}, 'win32')).toBe(binary);
    });
    it('fails closed for absent PATH and inaccessible tools', () => {
        expect(() => verificationExecutable('python', {})).toThrow('isolated PATH');
        const file = join(root, process.platform === 'win32' ? 'tool.EXE' : 'tool'); fs.writeFileSync(file, 'fixture', {mode: 0o700}); jest.spyOn(fs, 'accessSync').mockImplementation(() => { throw new Error('denied'); });
        expect(() => verificationExecutable('tool', {PATH: `${root}${delimiter}/missing`})).toThrow('isolated PATH');
    });
});
