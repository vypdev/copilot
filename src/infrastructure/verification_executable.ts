import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, resolve } from 'node:path';

/** @actions/exec resolves basenames against its own process PATH; native tools belong to the verifier PATH. */
export function verificationExecutable(program: string, environment: Record<string, string>, platform = process.platform): string {
    const explicit = isAbsolute(program) || /[\\/]/u.test(program);
    const candidates = explicit ? [resolve(program)] : (environment.PATH ?? '').split(delimiter).filter(Boolean).map(directory => resolve(join(directory, program)));
    const windowsExtensions = (environment.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
    const hasWindowsExtension = windowsExtensions.some(extension => program.toLowerCase().endsWith(extension.toLowerCase()));
    const extensions = platform === 'win32' && !hasWindowsExtension ? windowsExtensions : [''];
    for (const candidate of candidates) for (const extension of extensions) {
        const file = candidate + extension;
        try { if (statSync(file).isFile()) { accessSync(file, constants.X_OK); return file; } }
        catch { /* Try only the next executable in the isolated PATH. */ }
    }
    throw new Error('Verification executable is unavailable in the isolated PATH.');
}
