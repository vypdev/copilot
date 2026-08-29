import { loadProjectDetails } from '../project_details_loader';

describe('project details loader', () => {
    it('loads project details in input order', async () => {
        const getProjectDetail = jest.fn()
            .mockResolvedValueOnce({ id: 1 })
            .mockResolvedValueOnce({ id: 2 });
        await expect(loadProjectDetails({ getProjectDetail }, ['1', '2'], 'owner', 'token')).resolves.toEqual([
            { id: 1 },
            { id: 2 },
        ]);
        expect(getProjectDetail).toHaveBeenNthCalledWith(1, '1', 'owner', 'token');
        expect(getProjectDetail).toHaveBeenNthCalledWith(2, '2', 'owner', 'token');
    });

    it('rejects a missing repository owner before querying projects', async () => {
        const getProjectDetail = jest.fn();

        await expect(loadProjectDetails({ getProjectDetail }, ['1'], '', 'token'))
            .rejects.toThrow('Repository owner is required to load project details.');
        expect(getProjectDetail).not.toHaveBeenCalled();
    });

    it('does not require repository context when no projects were requested', async () => {
        const getProjectDetail = jest.fn();

        await expect(loadProjectDetails({ getProjectDetail }, [], '', 'token')).resolves.toEqual([]);
        expect(getProjectDetail).not.toHaveBeenCalled();
    });
});
