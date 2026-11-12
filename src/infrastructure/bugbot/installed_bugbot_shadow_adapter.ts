import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BugbotCiReader } from './github_bugbot_ci_reader';
import type { BugbotShadowVerificationPort } from '../../application/ports/bugbot_shadow_verification_ports';
import { askManagedBugbotShadowTurn, createPinnedBugbotShadowVerifier } from './shadow_verification_adapter';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- The pilot and the Action share the constrained Git reader.
const { git } = require('./shadow/git.cjs') as { git(root: string, args: string[]): string };

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Shared with the versioned deterministic broker controls.
const { createInstalledOfficialReader } = require('./shadow/installed_official.cjs') as {
    createInstalledOfficialReader(fetchSource?: typeof fetch): { readonly packages: readonly string[] };
};

export function createInstalledBugbotShadowVerifier(
    repository: { readonly owner: string; readonly name: string },
    workspace: string | undefined,
    transport = askManagedBugbotShadowTurn,
    readCi?: BugbotCiReader,
    fetchSource?: typeof fetch,
): BugbotShadowVerificationPort {
    const installedOfficial = createInstalledOfficialReader(fetchSource);
    return {
        async verify(request) {
            const { candidate, signal } = request;
            if (signal?.aborted) return { status: 'technical-failure', reason: 'investigation-canceled' };
            if (!workspace || candidate.repository.owner !== repository.owner || candidate.repository.name !== repository.name) {
                return { status: 'technical-failure', reason: 'shadow-source-unavailable' };
            }
            let scratch: string | undefined;
            try {
                const root = realpathSync(workspace);
                const top = realpathSync(git(root, ['rev-parse', '--show-toplevel']).trim());
                const gitDir = realpathSync(git(root, ['rev-parse', '--absolute-git-dir']).trim());
                if (top !== root || gitDir !== join(root, '.git')) {
                    return { status: 'technical-failure', reason: 'shadow-source-unavailable' };
                }
                const format = git(root, ['rev-parse', '--show-object-format']).trim();
                if (format !== 'sha1' && format !== 'sha256') {
                    return { status: 'technical-failure', reason: 'shadow-source-unavailable' };
                }
                const objects = realpathSync(join(gitDir, 'objects'));
                if (objects !== join(gitDir, 'objects') || /[\r\n]/u.test(objects)) {
                    return { status: 'technical-failure', reason: 'shadow-source-unavailable' };
                }
                // The broker reads exact object IDs without access to checkout configuration or remotes.
                scratch = mkdtempSync(join(tmpdir(), 'copilot-bugbot-objects-'));
                git(scratch, ['init', '--bare', '--quiet', '--template=', `--object-format=${format}`]);
                writeFileSync(join(scratch, 'objects', 'info', 'alternates'), objects + '\n', { mode: 0o600 });
                const repo = scratch;
                return await createPinnedBugbotShadowVerifier({ resolveSource: () => ({ repo, installedOfficial, readCi, pullRequest: candidate.pullRequest }), transport, managed: true }).verify(request);
            } catch {
                return { status: 'technical-failure', reason: 'shadow-source-unavailable' };
            } finally {
                if (scratch) rmSync(scratch, { recursive: true, force: true });
            }
        },
    };
}
