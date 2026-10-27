import * as github from '@actions/github';
import { createProgressObjectClient } from '../github_branch_client_factory';
import { ApplicationError } from '../../../application/errors/application_error';
import { resolveStaticApplicationErrorCatalog } from '../../../application/policies/application_error_message_catalog';
jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));
it('binds immutable commit/tree/blob reads through the normal credential-scoped client', async () => {
    const getCommit = jest.fn(async () => ({ data: { sha: 'a'.repeat(40), tree: { sha: 'b'.repeat(40) } } }));
    const git = { getCommit, getTree: jest.fn(), getBlob: jest.fn() };
    jest.mocked(github.getOctokit).mockReturnValue({ rest: { git } } as never);
    const client = createProgressObjectClient().getClient('fixture-token');
    await client.rest.git.getCommit({ owner: 'owner', repo: 'repo', commit_sha: 'a'.repeat(40) });
    expect(github.getOctokit).toHaveBeenCalledWith('fixture-token'); expect(client.rest.git).toBe(git);
    expect(getCommit).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', commit_sha: 'a'.repeat(40) });
});
it('explains unavailable immutable recovery with nonretryability and retained progress in EN/ES', () => {
    const error = new ApplicationError('validation.evidence-unavailable', 'Unreviewed paths: specs/a.md');
    expect(error.retryable).toBe(false); expect(error.impact).toContain('immutable contents');
    const en = resolveStaticApplicationErrorCatalog('en-US'), es = resolveStaticApplicationErrorCatalog('es-ES');
    expect(en.message('error.validation.evidence-unavailable.action')).toContain('unreviewed paths');
    expect(es.message('error.validation.evidence-unavailable.action')).toContain('rutas sin revisar');
    expect(en.message('error.validation.evidence-unavailable.retainedState')).toContain('progress labels');
    expect(es.message('error.validation.evidence-unavailable.retainedState')).toContain('etiquetas de progreso');
});
