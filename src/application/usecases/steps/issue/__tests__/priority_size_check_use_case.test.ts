import { runPrioritySizeCheck } from '../priority_size_check_use_case';

describe('runPrioritySizeCheck', () => {
    it('maps priority labels and emits a result for the selected content number', async () => {
        const setTaskPriority = jest.fn().mockResolvedValue(true);
        const project = { id: '1', title: 'Roadmap', type: 'organization', owner: 'org', url: 'https://github.com/org/project/1', number: 1 };
        const param = {
            contentNumber: 42,
            priority: {
                currentLabel: 'high',
                processable: true,
                high: 'high',
                medium: 'medium',
                low: 'low',
            },
            projects: [project],
        } as never;

        const result = await runPrioritySizeCheck(param, 'PriorityTask', { setTaskPriority } as never);

        expect(setTaskPriority).toHaveBeenCalledWith(project, 42, 'P0');
        expect(result[0]).toMatchObject({ id: 'PriorityTask', success: true, executed: true });
    });

    it('skips provider I/O when the current priority label is absent', async () => {
        const setTaskPriority = jest.fn();
        const result = await runPrioritySizeCheck({
            contentNumber: 42,
            priority: { currentLabel: undefined, processable: true, high: 'high', medium: 'medium', low: 'low' },
            projects: [{ id: '1', title: 'Roadmap', type: 'organization', owner: 'org', url: 'url', number: 1 }],
        } as never, 'PriorityTask', { setTaskPriority } as never);

        expect(result[0]).toMatchObject({ success: true, executed: false });
        expect(setTaskPriority).not.toHaveBeenCalled();
    });
});
