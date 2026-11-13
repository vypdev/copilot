import { execFile } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const probe = 'import platform, sqlite3; db = sqlite3.connect(":memory:"); ' +
    'print(platform.python_version()); print(sqlite3.sqlite_version); print(db.execute("SELECT sqlite_source_id()").fetchone()[0])';

export interface InstalledSqliteRuntime {
    readonly python: string;
    readonly sqlite: string;
    readonly sourceId: string;
}

function within(root: string, file: string): boolean {
    const location = relative(root, file);
    return !isAbsolute(location) && location !== '..' && !location.startsWith('..' + sep);
}

function interpreter(workspace: string): string | undefined {
    const executable = process.platform === 'win32' ? 'python.exe' : 'python3';
    for (const directory of (process.env.PATH ?? '').split(delimiter)) {
        if (!isAbsolute(directory) || within(workspace, directory)) continue;
        try {
            if (within(workspace, realpathSync(directory))) continue;
            const resolved = realpathSync(join(directory, executable));
            if (!within(workspace, resolved) && statSync(resolved).isFile()) return resolved;
        } catch { /* This PATH entry has no installed interpreter. */ }
    }
    return undefined;
}

/** Measures the host's linked standard-library SQLite in an application-owned directory. */
export async function readInstalledSqliteRuntime(workspace: string, scratch: string): Promise<InstalledSqliteRuntime | undefined> {
    const executable = interpreter(workspace);
    if (!executable) return undefined;
    try {
        const { stdout } = await execute(executable, ['-I', '-S', '-B', '-c', probe], {
            cwd: scratch, encoding: 'utf8', timeout: 4_000, maxBuffer: 1024,
            env: { LC_ALL: 'C', ...(process.platform === 'win32' && { SystemRoot: process.env.SystemRoot }) },
        });
        const [python, sqlite, sourceId, ...extra] = stdout.trim().split(/\r?\n/u);
        const release = /^\d+\.\d+\.\d+$/u;
        if (extra.length || !release.test(python) || !release.test(sqlite)
            || !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d [0-9a-f]{40,64}$/u.test(sourceId)) return undefined;
        return { python, sqlite, sourceId };
    } catch { return undefined; }
}
