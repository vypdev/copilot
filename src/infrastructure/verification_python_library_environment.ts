import fs from 'node:fs';
import { posix } from 'node:path';
import { verificationExecutable } from './verification_executable';

const MAX_VENV_METADATA_BYTES = 4_096;
const ownedPath = (value: unknown): value is string => typeof value === 'string' && posix.isAbsolute(value)
    && !/[:;$]/u.test(value) && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    && !value.split('/').includes('..');
const contained = (root: string, value: string): boolean => {
    const part = posix.relative(root, value);
    return part === '' || part !== '..' && !part.startsWith('../') && !posix.isAbsolute(part);
};
function directory(value: string): string | undefined {
    // Callers check the lexical candidate before any filesystem access.
    const actual = fs.realpathSync(value);
    return ownedPath(actual) && fs.lstatSync(actual).isDirectory() ? actual : undefined;
}

/** Read only the base-home fact; executable/command text is inert, and file identity must stay stable. */
function venvBaseHome(file: string): string | undefined {
    const before = fs.lstatSync(file, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(MAX_VENV_METADATA_BYTES)) return undefined;
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const opened = fs.fstatSync(descriptor, { bigint: true });
        if (!opened.isFile() || opened.nlink !== 1n || opened.dev !== before.dev || opened.ino !== before.ino
            || opened.size !== before.size || opened.mtimeNs !== before.mtimeNs) return undefined;
        const bytes = Buffer.alloc(MAX_VENV_METADATA_BYTES + 1);
        const size = fs.readSync(descriptor, bytes, 0, bytes.length, 0);
        const after = fs.fstatSync(descriptor, { bigint: true });
        if (size !== Number(opened.size) || size > MAX_VENV_METADATA_BYTES || after.size !== opened.size
            || after.mtimeNs !== opened.mtimeNs || after.nlink !== 1n) return undefined;
        const homes = bytes.subarray(0, size).toString('utf8').split(/\r?\n/u)
            .filter(line => /^\s*home\s*=/u.test(line)).map(line => line.slice(line.indexOf('=') + 1).trim());
        return homes.length === 1 ? homes[0] : undefined;
    } finally { fs.closeSync(descriptor); }
}

/** Capture the trusted tool cache before candidate execution; prepare only verifier children. */
export function captureVerificationPythonLibraries(
    toolRoot: string | undefined,
    platform: NodeJS.Platform = process.platform,
): (environment: Record<string, string>) => void {
    const lexicalRoot = ownedPath(toolRoot) ? toolRoot : undefined;
    let cache: string | undefined;
    if (platform === 'linux' && lexicalRoot) {
        try {
            cache = directory(lexicalRoot);
            if (cache === '/') cache = undefined;
        } catch { /* Missing cache is not an inferred runtime requirement. */ }
    }
    return environment => {
        delete environment.LD_LIBRARY_PATH;
        if (!cache || !lexicalRoot) return;
        try {
            const selected = verificationExecutable('python3', environment, 'linux');
            if (!ownedPath(selected)) return;
            const privateSelection = ownedPath(environment.HOME) && environment.HOME !== '/' && contained(environment.HOME, selected);
            if (!contained(lexicalRoot, selected) && !contained(cache, selected) && !privateSelection) return;
            const actual = fs.realpathSync(selected);
            if (!ownedPath(actual) || !fs.lstatSync(actual).isFile()) return;
            let bin = posix.dirname(actual);
            if (!contained(cache, actual)) {
                if (!privateSelection || posix.basename(posix.dirname(selected)) !== 'bin') return;
                const home = directory(environment.HOME);
                if (home !== environment.HOME || !contained(environment.HOME, actual)) return;
                const venv = directory(posix.dirname(posix.dirname(selected)));
                if (!venv || !contained(home, venv)) return;
                const base = venvBaseHome(posix.join(venv, 'pyvenv.cfg'));
                if (!ownedPath(base) || !contained(lexicalRoot, base) && !contained(cache, base)) return;
                const baseBin = directory(base);
                if (!baseBin || !contained(cache, baseBin)) return;
                bin = baseBin;
            }
            if (posix.basename(bin) !== 'bin') return;
            const lib = posix.join(posix.dirname(bin), 'lib');
            if (!contained(cache, lib)) return;
            const actualLibrary = directory(lib);
            if (actualLibrary && contained(cache, actualLibrary)) environment.LD_LIBRARY_PATH = actualLibrary;
        } catch { /* Readiness is established by the unchanged real probe/verifier, never by this lookup. */ }
    };
}
