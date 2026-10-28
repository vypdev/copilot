import { ProgressComparisonSourceRepository } from '../../../data/repository/progress_comparison_source_repository';
import * as github from '@actions/github';
import { createProgressObjectClient, createProgressComparisonClient } from '../github_branch_client_factory';
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

it('binds native PR comparison reads to the existing repository credential without a write capability',async()=>{
    const list=jest.fn(async()=>({data:[]})),get=jest.fn();jest.mocked(github.getOctokit).mockReturnValue({rest:{pulls:{list,get}}}as never);
    const repository=new ProgressComparisonSourceRepository(createProgressComparisonClient());
    expect(await repository.getSource('owner','repo','chore/727-native','fixture-token')).toEqual({kind:'none'});
    expect(github.getOctokit).toHaveBeenCalledWith('fixture-token');expect(list).toHaveBeenCalledWith({owner:'owner',repo:'repo',state:'open',head:'owner:chore/727-native',per_page:2,page:1});expect(get).not.toHaveBeenCalled();
});
