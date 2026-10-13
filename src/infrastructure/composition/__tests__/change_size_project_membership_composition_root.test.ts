import { createChangeSizeProjectMembershipQueryPort } from '../change_size_project_membership_composition_root';
import { isProjectContentLinked } from '../../../data/repository/project/project_board_item_query';
import { ProjectDetail } from '../../../data/model/project_detail';

const mockClient = {};
const mockGetClient = jest.fn(() => mockClient);
jest.mock('../github_project_client_factory', () => ({ createGraphqlTransportClient: () => ({ getClient: mockGetClient }) }));
jest.mock('../../../data/repository/project/project_board_item_query', () => ({ isProjectContentLinked: jest.fn().mockResolvedValue(false) }));

it('binds the exact repository credential while exposing only frozen read authority', async () => {
    const port = createChangeSizeProjectMembershipQueryPort({ owner: 'owner', repository: 'repo', token: 'private-token' });
    const project = { id: 'PVT_board', title: 'Board', owner: 'owner', type: 'organization', url: '', number: 1 };
    expect(Object.keys(port)).toEqual(['isContentLinked']);
    expect(Object.isFrozen(port)).toBe(true);
    expect(mockGetClient).toHaveBeenCalledWith('private-token');
    await expect(port.isContentLinked(project, 99)).resolves.toBe(false);
    expect(isProjectContentLinked).toHaveBeenCalledWith(mockClient, expect.any(ProjectDetail), 'owner', 'repo', 99);
    expect((isProjectContentLinked as jest.Mock).mock.calls[0][1]).toMatchObject(project);
});
