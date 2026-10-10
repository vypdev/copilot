import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Explicit Action validation owns automation commits; contributor hooks stay configured. */
export async function withoutGitHooks<T>(commit: (emptyHooks: string) => Promise<T>): Promise<T> {
    const emptyHooks = mkdtempSync(join(tmpdir(), 'copilot-git-hooks-'));
    try {
        return await commit(emptyHooks);
    } finally {
        rmSync(emptyHooks, { recursive: true, force: true });
    }
}
