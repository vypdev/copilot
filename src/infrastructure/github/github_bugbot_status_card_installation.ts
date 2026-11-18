import { getOctokit } from '@actions/github';

export const bugbotStatusCardWorkflow = 'copilot_bugbot_status_card.yml';
export const bugbotStatusCardPath = '.github/workflows/' + bugbotStatusCardWorkflow;
const workflowParents = [['.github/workflows', bugbotStatusCardWorkflow], ['.github', 'workflows'], ['', '.github']] as const;

export function statusCardGithubErrorStatus(error: unknown): unknown {
    return error && typeof error === 'object' && 'status' in error ? error.status : undefined;
}

export async function readGithubBugbotStatusCardInstallation(
    api: ReturnType<typeof getOctokit>, scope: { owner: string; repo: string }, ref?: string,
): Promise<'installed' | 'absent' | 'unknown'> {
    const repository = { ...scope, ...(ref ? { ref } : {}) };
    try {
        const { data } = await api.rest.repos.getContent({ ...repository, path: bugbotStatusCardPath });
        if (!Array.isArray(data) && data.type === 'file' && data.encoding === 'base64'
            && Buffer.from(data.content, 'base64').toString('utf8').includes("COPILOT_BUGBOT_STATUS_CARD_WORKFLOW: 'write-v1'")) {
            return 'installed';
        }
    } catch (error) {
        if (statusCardGithubErrorStatus(error) === 404) return proveWorkflowAbsent(api, repository);
    }
    return 'unknown';
}

/** GitHub can also return 404 for inaccessible files. Prove absence from a readable parent. */
async function proveWorkflowAbsent(
    api: ReturnType<typeof getOctokit>, repository: { owner: string; repo: string; ref?: string },
): Promise<'absent' | 'unknown'> {
    for (const [path, child] of workflowParents) {
        try {
            const { data } = await api.rest.repos.getContent({ ...repository, path });
            return Array.isArray(data) && data.length < 1000
                && data.every((entry: { name: string }) => typeof entry?.name === 'string' && entry.name !== child)
                ? 'absent' : 'unknown';
        } catch (error) {
            if (statusCardGithubErrorStatus(error) !== 404) return 'unknown';
        }
    }
    return 'unknown';
}
