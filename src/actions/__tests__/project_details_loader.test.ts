import { loadProjectDetails } from '../project_details_loader';

describe('project details loader', () => {
    it('loads project details in input order', async () => {
        const getProjectDetail = jest.fn()
            .mockResolvedValueOnce({ id: 1 })
            .mockResolvedValueOnce({ id: 2 });
        await expect(loadProjectDetails({ getProjectDetail }, ['1', '2'], 'token')).resolves.toEqual([
            { id: 1 },
            { id: 2 },
        ]);
        expect(getProjectDetail).toHaveBeenNthCalledWith(1, '1', 'token');
        expect(getProjectDetail).toHaveBeenNthCalledWith(2, '2', 'token');
    });
});
