import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { delimiter, isAbsolute, relative, sep } from 'node:path';
import { parseVerificationSetupResult, VerificationSetupError, VERIFICATION_SETUP_LIMITS } from '../application/policies/verification_setup_policy';

function contained(root: string, path: string): boolean {
    const remainder = relative(root, path);
    return remainder === '' || (remainder !== '..' && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder));
}

/** Accept only existing contained directories, checking both lexical paths and symlink targets. */
function approvedDirectory(value: string, roots: readonly string[]): string {
    if (!isAbsolute(value) || value.includes(delimiter) || value.split(/[\\/]/u).includes('..')
        || !roots.some(root => contained(root, value))) throw new VerificationSetupError('result-invalid');
    const actual = realpathSync(value);
    if (!roots.some(root => contained(root, actual)) || !lstatSync(actual).isDirectory()) throw new VerificationSetupError('result-invalid');
    return actual;
}

export function applyVerificationSetupResult(file: string, environment: Record<string, string>, roots: readonly string[]): void {
    let descriptor: number | undefined;
    try {
        let before;
        try { before = lstatSync(file, { bigint: true }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
        if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > BigInt(VERIFICATION_SETUP_LIMITS.resultBytes)) throw new Error();
        descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const opened = fstatSync(descriptor, { bigint: true });
        if (!opened.isFile() || opened.nlink !== 1n || opened.dev !== before.dev || opened.ino !== before.ino
            || opened.size !== before.size || opened.mtimeNs !== before.mtimeNs) throw new Error();
        const bytes = Buffer.alloc(VERIFICATION_SETUP_LIMITS.resultBytes + 1);
        const size = readSync(descriptor, bytes, 0, bytes.length, 0);
        if (size > VERIFICATION_SETUP_LIMITS.resultBytes) throw new Error();
        const after = fstatSync(descriptor, { bigint: true });
        if (after.size !== opened.size || after.mtimeNs !== opened.mtimeNs) throw new Error();
        const result = parseVerificationSetupResult(JSON.parse(bytes.subarray(0, size).toString('utf8')));
        const paths = result.path.map(value => approvedDirectory(value, roots));
        const javaHome = result.javaHome ? approvedDirectory(result.javaHome, roots) : undefined;
        if (paths.length) environment.PATH = [...paths, ...(environment.PATH ? [environment.PATH] : [])].join(delimiter);
        if (javaHome) environment.JAVA_HOME = javaHome;
    } catch { throw new VerificationSetupError('result-invalid'); }
    finally { if (descriptor !== undefined) closeSync(descriptor); }
}
