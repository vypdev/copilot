import { SETUP_CREDENTIAL_HEALTH_WORKFLOW_FILE } from '../../../domain/setup_workflow_catalog';
import { isGithubNotFound } from './github_error_policy';

/** A workflow API 404 is confirmed absence only after two independent Contents reads. */
export async function inspectMissingCredentialHealthWorkflow(
    getContent: ((parameters: Record<string, unknown>) => Promise<unknown>) | undefined,
    owner: string,
    repository: string,
    ref?: string,
): Promise<'missing' | 'unavailable'> {
    const state = await inspectCredentialHealthWorkflowAtRef(getContent, owner, repository, ref);
    return state === 'missing' ? 'missing' : 'unavailable';
}

/** Exact workflow file state on a selected ref, independent of Actions' default-branch index. */
export async function inspectCredentialHealthWorkflowAtRef(
    getContent: ((parameters: Record<string, unknown>) => Promise<unknown>) | undefined,
    owner: string,
    repository: string,
    ref?: string,
): Promise<'installed' | 'missing' | 'unavailable'> {
    if (!getContent) return 'unavailable';
    const target = { owner, repo: repository, ...(ref !== undefined ? { ref } : {}) };
    try {
        const visibility = await getContent({ ...target, path: '' });
        if (typeof visibility !== 'object' || visibility === null || !('data' in visibility)
            || !Array.isArray(visibility.data)
            || !visibility.data.every(entry => typeof entry === 'object' && entry !== null
                && 'name' in entry && typeof entry.name === 'string'
                && entry.name.trim().length > 0)) return 'unavailable';
    } catch {
        return 'unavailable';
    }
    try {
        const exact = await getContent({ ...target, path: `.github/workflows/${SETUP_CREDENTIAL_HEALTH_WORKFLOW_FILE}` });
        return typeof exact === 'object' && exact !== null && 'data' in exact
            && typeof exact.data === 'object' && exact.data !== null && !Array.isArray(exact.data)
            && 'sha' in exact.data && typeof exact.data.sha === 'string'
            && exact.data.sha.trim().length > 0 ? 'installed' : 'unavailable';
    } catch (error) {
        return isGithubNotFound(error) ? 'missing' : 'unavailable';
    }
}
