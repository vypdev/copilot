import { SETUP_CREDENTIAL_HEALTH_WORKFLOW_FILE } from '../../../domain/setup_workflow_catalog';
import { isGithubNotFound } from './github_error_policy';

/** A workflow API 404 is confirmed absence only after two independent Contents reads. */
export async function inspectMissingCredentialHealthWorkflow(
    getContent: ((parameters: Record<string, unknown>) => Promise<unknown>) | undefined,
    owner: string,
    repository: string,
    ref?: string,
): Promise<'missing' | 'unavailable'> {
    if (!getContent) return 'unavailable';
    const target = { owner, repo: repository, ...(ref !== undefined ? { ref } : {}) };
    try {
        const visibility = await getContent({ ...target, path: '' });
        if (typeof visibility !== 'object' || visibility === null || !('data' in visibility)
            || visibility.data === null || visibility.data === undefined) return 'unavailable';
    } catch {
        return 'unavailable';
    }
    try {
        await getContent({ ...target, path: `.github/workflows/${SETUP_CREDENTIAL_HEALTH_WORKFLOW_FILE}` });
        return 'unavailable';
    } catch (error) {
        return isGithubNotFound(error) ? 'missing' : 'unavailable';
    }
}
