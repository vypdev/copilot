import { runPrioritySizeCheck } from '../priority_size_check_use_case';

describe('runPrioritySizeCheck', () => {
    it('maps priority labels and emits a result for the selected content number', async () => {
        const setTaskPriority = jest.fn().mockResolvedValue(true);
        const project = { title: 'Roadmap', publicUrl: 'https://github.com/org/project/1' };
        const param = {
            labels: {
                priorityLabelOnIssue: 'high',
                priorityLabelOnIssueProcessable: true,
                priorityHigh: 'high',
                priorityMedium: 'medium',
                priorityLow: 'low',
            },
            project: { getProjects: () => [project] },
            owner: 'org',
            repo: 'repo',
            issueNumber: 42,
            tokens: { token: 'token' },
        } as never;

        const result = await runPrioritySizeCheck(param, 'PriorityTask', 42, { setTaskPriority } as never);

        expect(setTaskPriority).toHaveBeenCalledWith(project, 'org', 'repo', 42, 'P0', 'token');
        expect(result[0]).toMatchObject({ id: 'PriorityTask', success: true, executed: true });
    });
});
