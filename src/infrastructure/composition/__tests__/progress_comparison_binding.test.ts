import * as github from '@actions/github';
import { CheckProgressUseCase } from '../../../application/usecases/actions/check_progress_use_case';
import { createCheckProgressCompositionRoot } from '../check_progress_composition_root';

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));
jest.mock('../../../application/usecases/actions/check_progress_use_case', () => ({ CheckProgressUseCase: jest.fn() }));
jest.mock('../agent_capability_composition_root', () => ({ createFindingsQueryPort: () => ({ query: jest.fn() }) }));
jest.mock('../issue_completion_composition_root', () => ({ createNativeStatusReadPort: () => ({ readIssue: jest.fn() }) }));

it('binds both progress evidence queries to one repository/credential and exposes only frozen read capabilities', async () => {
    const base = 'a'.repeat(40), head = 'b'.repeat(40);
    const list = jest.fn(async () => ({ data: [] }));
    const compareCommits = jest.fn(async () => ({ data: {
        base_commit: { sha: base }, merge_base_commit: { sha: base },
        ahead_by: 1, behind_by: 0, total_commits: 1, files: [], commits: [],
    } }));
    jest.mocked(github.getOctokit).mockReturnValue({ rest: {
        pulls: { list, get: jest.fn() }, repos: { compareCommits },
    } } as never);

    createCheckProgressCompositionRoot({ owner: 'tenant', repository: 'project', token: 'fixture-private-token' });
    const args = jest.mocked(CheckProgressUseCase).mock.calls[0], diff = args[7], source = args[8];
    expect(Object.keys(diff)).toEqual(['getDiff']);
    expect(Object.keys(source)).toEqual(['getSource']);
    expect(Object.isFrozen(diff)).toBe(true);
    expect(Object.isFrozen(source)).toBe(true);
    expect(await source.getSource('chore/727-scope')).toEqual({ kind: 'none' });
    expect((await diff.getDiff(base, head)).kind).toBe('single');
    expect(list).toHaveBeenCalledWith({
        owner: 'tenant', repo: 'project', state: 'open', head: 'tenant:chore/727-scope', per_page: 2, page: 1,
    });
    expect(compareCommits).toHaveBeenCalledWith({ owner: 'tenant', repo: 'project', base, head, per_page: 1, page: 1 });
    expect(github.getOctokit).toHaveBeenCalledWith('fixture-private-token');
});
