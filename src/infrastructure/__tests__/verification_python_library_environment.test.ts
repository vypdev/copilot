import fs from 'node:fs';
import { captureVerificationPythonLibraries } from '../verification_python_library_environment';
import { verificationExecutable } from '../verification_executable';

jest.mock('../verification_executable', () => ({ verificationExecutable: jest.fn() }));

describe('owned CPython loader environment', () => {
    const cache = '/runner/tool-cache';
    const prefix = cache + '/Python/3.11.17/arm64';
    const binary = prefix + '/bin/python3.11';
    const library = prefix + '/lib';
    const home = '/owned/private-profile';
    const copied = home + '/venv/bin/python3';
    const configuration = home + '/venv/pyvenv.cfg';
    let selected: string;
    let root: string | undefined;
    let platform: NodeJS.Platform;
    let entries: Map<string, 'file' | 'directory' | 'symlink'>;
    let aliases: Map<string, string>;
    let configurationText: string;
    let linkCount: bigint;
    let declaredSize: bigint | undefined;
    let readLength: number | undefined;
    let openedEdit: Record<string, bigint>;
    let afterEdit: Record<string, bigint>;
    let fstatCalls: number;
    let before: NodeJS.ProcessEnv;

    const stamp = (edit: Record<string, bigint> = {}) => ({
        dev: 1n, ino: 2n, nlink: linkCount, size: declaredSize ?? BigInt(Buffer.byteLength(configurationText)), mtimeNs: 3n,
        isFile: () => entries.get(configuration) === 'file',
        ...edit,
    });
    const copy = () => { selected = copied; entries.set(copied, 'file'); };
    const environment = () => ({ HOME: home, PATH: '/selected/bin:/usr/bin', LD_LIBRARY_PATH: '/foreign/caller', LANG: 'C.UTF-8' });
    const prepare = () => captureVerificationPythonLibraries(root, platform);

    beforeEach(() => {
        before = { ...process.env };
        root = cache; platform = 'linux'; selected = binary;
        entries = new Map([
            [cache, 'directory'], [prefix, 'directory'], [prefix + '/bin', 'directory'], [binary, 'file'], [library, 'directory'],
            [home, 'directory'], [home + '/venv', 'directory'], [home + '/venv/bin', 'directory'], [configuration, 'file'],
        ]);
        aliases = new Map(); configurationText = 'home = ' + prefix + '/bin\ninclude-system-site-packages = false\nversion = 3.11.17\n';
        linkCount = 1n; declaredSize = undefined; readLength = undefined; openedEdit = {}; afterEdit = {}; fstatCalls = 0;
        jest.mocked(verificationExecutable).mockImplementation(() => selected);
        jest.spyOn(fs, 'realpathSync').mockImplementation(name => {
            const value = String(name);
            if (!entries.has(value) && !aliases.has(value)) throw new Error('missing');
            return (aliases.get(value) ?? value) as never;
        });
        jest.spyOn(fs, 'lstatSync').mockImplementation(name => {
            const value = String(name);
            if (!entries.has(value)) throw new Error('missing');
            if (value === configuration) return stamp() as never;
            return { isDirectory: () => entries.get(value) === 'directory', isFile: () => entries.get(value) === 'file' } as never;
        });
        jest.spyOn(fs, 'openSync').mockReturnValue(99);
        jest.spyOn(fs, 'fstatSync').mockImplementation(() => stamp(fstatCalls++ === 0 ? openedEdit : afterEdit) as never);
        jest.spyOn(fs, 'readSync').mockImplementation((_fd, buffer) => {
            Buffer.from(configurationText).copy(buffer as Buffer);
            return readLength ?? Buffer.byteLength(configurationText);
        });
        jest.spyOn(fs, 'closeSync').mockImplementation(() => undefined);
    });
    afterEach(() => { jest.restoreAllMocks(); process.env = before; });

    it('derives the library of the selected cached interpreter', () => {
        const env = environment(); prepare()(env);
        expect(env.LD_LIBRARY_PATH).toBe(library); expect(fs.openSync).not.toHaveBeenCalled();
    });
    it('uses the cached target of a private symlinked interpreter', () => {
        selected = copied; aliases.set(copied, binary);
        const env = environment(); prepare()(env);
        expect(env.LD_LIBRARY_PATH).toBe(library); expect(fs.openSync).not.toHaveBeenCalled();
    });
    it('reads the base home for a copied private interpreter and closes its descriptor', () => {
        copy(); const env = environment(); prepare()(env);
        expect(env.LD_LIBRARY_PATH).toBe(library); expect(fs.closeSync).toHaveBeenCalledWith(99);
    });
    it('keeps a captured canonical root when the runner cache has a stable alias', () => {
        root = '/runner/cache-alias'; aliases.set(root, cache);
        selected = root + '/Python/3.11.17/arm64/bin/python3.11'; aliases.set(selected, binary);
        const env = environment(); prepare()(env);
        expect(env.LD_LIBRARY_PATH).toBe(library);
    });
    it('accepts CRLF venv metadata without evaluating unrelated command text', () => {
        copy(); configurationText = 'home = ' + prefix + '/bin\r\ncommand = $(do-not-execute)\r\nversion = 3.11.17\r\n';
        const env = environment(); prepare()(env); expect(env.LD_LIBRARY_PATH).toBe(library);
    });
    it('prepares fresh child maps while preserving the parent environment and other metadata', () => {
        process.env.LD_LIBRARY_PATH = '/parent/foreign'; const parent = { ...process.env };
        const captured = prepare(); const first = environment(); const second = environment();
        captured(first); captured(second);
        expect(first.LD_LIBRARY_PATH).toBe(library); expect(second.LD_LIBRARY_PATH).toBe(library);
        expect(first.LANG).toBe('C.UTF-8'); expect(process.env).toEqual(parent);
    });
    it('uses the default platform without introducing a runtime requirement', () => {
        const env = environment(); captureVerificationPythonLibraries(cache)(env);
        if (process.platform === 'linux') expect(env.LD_LIBRARY_PATH).toBe(library);
        else expect(env).not.toHaveProperty('LD_LIBRARY_PATH');
    });
    it('does not follow a runner-root alias that changes after capture', () => {
        root = '/runner/cache-alias'; aliases.set(root, cache);
        const captured = prepare();
        selected = root + '/Python/3.11.17/arm64/bin/python3.11'; aliases.set(selected, '/outside/bin/python3.11');
        const env = environment(); captured(env); expect(env).not.toHaveProperty('LD_LIBRARY_PATH');
    });

    const rejected: Array<[string, () => void]> = [
        ['missing tool cache', () => { root = undefined; }],
        ['non-Linux macOS', () => { platform = 'darwin'; }],
        ['non-Linux Windows', () => { platform = 'win32'; }],
        ['relative tool cache', () => { root = 'relative'; }],
        ['non-directory tool cache', () => { entries.set(cache, 'file'); }],
        ['missing tool cache directory', () => { entries.delete(cache); }],
        ['unsafe canonical cache', () => { aliases.set(cache, '/bad;cache'); entries.set('/bad;cache', 'directory'); }],
        ['cache alias claims the entire filesystem', () => { root = '/runner/broad-alias'; aliases.set(root, '/'); entries.set('/', 'directory'); }],
        ['relative interpreter', () => { selected = 'python3'; }],
        ['foreign lexical interpreter', () => { selected = '/account/bin/python3'; }],
        ['escaping canonical interpreter', () => { aliases.set(binary, '/outside/bin/python3'); entries.set('/outside/bin/python3', 'file'); }],
        ['directory interpreter', () => { entries.set(binary, 'directory'); }],
        ['non-bin interpreter layout', () => { selected = prefix + '/scripts/python3'; entries.set(selected, 'file'); }],
        ['missing library directory', () => { entries.delete(library); }],
        ['non-directory library', () => { entries.set(library, 'file'); }],
        ['escaping library alias', () => { aliases.set(library, '/outside/lib'); entries.set('/outside/lib', 'directory'); }],
        ['parent traversal', () => { selected = prefix + '/bin/../bin/python3'; }],
        ['missing copied-venv configuration', () => { copy(); entries.delete(configuration); }],
        ['non-regular copied-venv configuration', () => { copy(); entries.set(configuration, 'directory'); }],
        ['symlinked copied-venv configuration', () => { copy(); entries.set(configuration, 'symlink'); }],
        ['hard-linked copied-venv configuration', () => { copy(); linkCount = 2n; }],
        ['oversized copied-venv configuration', () => { copy(); declaredSize = 4_097n; }],
        ['missing base home', () => { copy(); configurationText = 'version = 3.11.17\n'; }],
        ['duplicate base homes', () => { copy(); configurationText += 'home = ' + prefix + '/bin\n'; }],
        ['relative base home', () => { copy(); configurationText = 'home = relative/bin\n'; }],
        ['foreign base home', () => { copy(); configurationText = 'home = /account/bin\n'; }],
        ['escaping base home alias', () => { copy(); aliases.set(prefix + '/bin', '/outside/bin'); entries.set('/outside/bin', 'directory'); }],
        ['short configuration read', () => { copy(); readLength = 1; }],
        ['configuration changes before open', () => { copy(); openedEdit = { ino: 3n }; }],
        ['configuration device changes before open', () => { copy(); openedEdit = { dev: 2n }; }],
        ['configuration gains a link before open', () => { copy(); openedEdit = { nlink: 2n }; }],
        ['configuration size changes before open', () => { copy(); openedEdit = { size: 1n }; }],
        ['configuration timestamp changes before open', () => { copy(); openedEdit = { mtimeNs: 4n }; }],
        ['configuration changes while reading', () => { copy(); afterEdit = { mtimeNs: 4n }; }],
        ['configuration size changes while reading', () => { copy(); afterEdit = { size: 1n }; }],
        ['configuration gains a link while reading', () => { copy(); afterEdit = { nlink: 2n }; }],
        ['configuration grows past its read bound', () => { copy(); readLength = 4_097; }],
        ['private home redirects to an account directory', () => {
            copy(); aliases.set(home, '/account/real-home'); entries.set('/account/real-home', 'directory');
            aliases.set(copied, '/account/real-home/venv/bin/python3'); entries.set('/account/real-home/venv/bin/python3', 'file');
        }],
        ['private executable escapes its unchanged home', () => { copy(); aliases.set(copied, '/outside/bin/python3'); entries.set('/outside/bin/python3', 'file'); }],
        ['cache named bin would select a library outside its root', () => {
            root = '/runner/bin'; entries.set(root, 'directory'); selected = root + '/python3'; entries.set(selected, 'file');
        }],
        ['escaping private venv parent', () => { copy(); aliases.set(home + '/venv', '/outside/venv'); entries.set('/outside/venv', 'directory'); }],
        ['interpreter lookup failure', () => { jest.mocked(verificationExecutable).mockImplementation(() => { throw new Error('unavailable'); }); }],
        ['metadata read failure', () => { copy(); jest.mocked(fs.readSync).mockImplementation(() => { throw new Error('read'); }); }],
        ['descriptor close failure', () => { copy(); jest.mocked(fs.closeSync).mockImplementation(() => { throw new Error('close'); }); }],
    ];
    it.each(rejected)('excludes inherited loader state for %s', (_name, edit) => {
        edit(); const env = environment(); prepare()(env); expect(env).not.toHaveProperty('LD_LIBRARY_PATH');
    });
    it.each([':', ';', '$ORIGIN', '\n', '\0', '\u007f'])('rejects loader syntax in an otherwise present library path: %j', token => {
        const unsafe = cache + '/library' + token + 'suffix'; aliases.set(library, unsafe); entries.set(unsafe, 'directory');
        const env = environment(); prepare()(env); expect(env).not.toHaveProperty('LD_LIBRARY_PATH');
    });
});
