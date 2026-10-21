import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { applyVerificationSetupResult } from '../verification_setup_result';
import { VerificationSetupError } from '../../application/policies/verification_setup_policy';

describe('bounded setup result filesystem contract', () => {
    let root: string; let environment: Record<string, string>; let result: string;
    beforeEach(() => {
        root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'copilot-setup-result-')));
        environment = { HOME: root, PATH: 'baseline' }; result = join(root, 'result.json');
    });
    afterEach(() => { jest.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
    it('accepts an absent result without changing verification environment', () => {
        applyVerificationSetupResult(result, environment, [root]); expect(environment).toEqual({ HOME: root, PATH: 'baseline' });
    });
    it('prepends approved directories and changes only JAVA_HOME', () => {
        const bin = join(root, 'bin'); fs.mkdirSync(bin);
        fs.writeFileSync(result, JSON.stringify({ schemaVersion: 1, path: [bin], environment: { JAVA_HOME: root } }));
        applyVerificationSetupResult(result, environment, [root]);
        expect(environment).toEqual({ HOME: root, PATH: `${bin}${delimiter}baseline`, JAVA_HOME: root });
    });
    it('supports a PATH addition with no inherited PATH', () => {
        delete environment.PATH; fs.writeFileSync(result, JSON.stringify({ schemaVersion: 1, path: [root] }));
        applyVerificationSetupResult(result, environment, [root]); expect(environment.PATH).toBe(root);
    });
    it.each([
        'not json secret', 'x'.repeat(16_385), JSON.stringify({ schemaVersion: 1, environment: { PAT: 'secret' } }),
        JSON.stringify({ schemaVersion: 1, path: ['relative'] }),
    ])('rejects unsafe result content %#', content => {
        fs.writeFileSync(result, content);
        expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(expect.objectContaining({ reason: 'result-invalid' }));
        expect(environment).toEqual({ HOME: root, PATH: 'baseline' });
    });
    it('rejects directory results', () => {
        fs.mkdirSync(result); expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(VerificationSetupError);
    });
    it('rejects hard-linked result files', () => {
        const original = join(root, 'original'); fs.writeFileSync(original, '{"schemaVersion":1}'); fs.linkSync(original, result);
        expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(VerificationSetupError);
    });
    it.each(['outside', 'traversal', 'delimiter', 'missing', 'file', 'link'])('rejects %s PATH directories', kind => {
        const outside = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'copilot-setup-outside-')));
        const file = join(root, 'ordinary'); fs.writeFileSync(file, 'text');
        const link = join(root, 'link'); fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
        const values: Record<string, string> = { outside, traversal: join(root, 'child') + '/../../escape', delimiter: root + delimiter + outside, missing: join(root, 'missing'), file, link };
        fs.writeFileSync(result, JSON.stringify({ schemaVersion: 1, path: [values[kind]] }));
        try { expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(VerificationSetupError); }
        finally { fs.rmSync(outside, { recursive: true, force: true }); }
    });
    it('does not apply partial PATH changes when JAVA_HOME is rejected', () => {
        fs.writeFileSync(result, JSON.stringify({ schemaVersion: 1, path: [root], environment: { JAVA_HOME: '/outside/untrusted' } }));
        expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(VerificationSetupError);
        expect(environment.PATH).toBe('baseline');
    });
    it('rejects a result replaced between lstat and open', () => {
        fs.writeFileSync(result, '{"schemaVersion":1}'); const original = fs.fstatSync;
        jest.spyOn(fs, 'fstatSync').mockImplementation(((fd: number, options: {bigint?: boolean}) => {
            const stat = original(fd, options as { bigint: true }); return { ...stat, ino: stat.ino + 1n };
        }) as typeof fs.fstatSync);
        expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(VerificationSetupError);
    });
    it('bounds a result that grows after its initial stat', () => {
        fs.writeFileSync(result, '{"schemaVersion":1}');
        jest.spyOn(fs, 'readSync').mockReturnValueOnce(16_385);
        expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(VerificationSetupError);
    });
    it('rejects a result mutated during the bounded read', () => {
        fs.writeFileSync(result, '{"schemaVersion":1}'); const original = fs.fstatSync; let calls = 0;
        jest.spyOn(fs, 'fstatSync').mockImplementation(((fd: number, options: {bigint?: boolean}) => {
            const stat = original(fd, options as { bigint: true }); calls++;
            return calls === 2 ? { ...stat, mtimeNs: stat.mtimeNs + 1n } : stat;
        }) as typeof fs.fstatSync);
        expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(VerificationSetupError);
    });
    it('maps access denial without exposing raw filesystem diagnostics', () => {
        jest.spyOn(fs, 'lstatSync').mockImplementationOnce(() => { throw Object.assign(new Error('secret path'), { code: 'EACCES' }); });
        expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(expect.objectContaining({ reason: 'result-invalid', message: expect.not.stringContaining('secret') }));
    });
});
