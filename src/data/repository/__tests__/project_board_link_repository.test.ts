import { ProjectBoardLinkRepository } from '../project/project_board_link_repository';
import { ProjectDetail } from '../../model/project_detail';
import type { ProjectBoardQueryPort } from '../../../application/ports/project_board_query_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';

describe('ProjectBoardLinkRepository', () => {
  const project = new ProjectDetail({ id: 'project-1' });
  const queryPort = { getLinkedContentItemId: jest.fn() } as unknown as ProjectBoardQueryPort;
  const graphql = jest.fn();
  const graphqlPort = {
    getClient: jest.fn(() => ({ graphql })),
  } as unknown as GithubClientPort<GithubGraphqlTransportClient>;
  let repository: ProjectBoardLinkRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new ProjectBoardLinkRepository(queryPort, graphqlPort);
    (queryPort.getLinkedContentItemId as jest.Mock).mockResolvedValue(undefined);
  });

  it('returns the authoritative item ID from the link mutation', async () => {
    graphql.mockResolvedValue({ addProjectV2ItemById: { item: { id: 'item-1' } } });

    await expect(repository.linkContentId(project, 'content-1', 'token')).resolves.toBe('item-1');
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it('rejects an incomplete mutation response instead of silently skipping status synchronization', async () => {
    graphql.mockResolvedValue({ addProjectV2ItemById: {} });

    await expect(repository.linkContentId(project, 'content-1', 'token')).rejects.toThrow(
      'GitHub did not return the project item created for content content-1 in project project-1.',
    );
  });

  it('returns the existing project item ID without creating a duplicate', async () => {
    (queryPort.getLinkedContentItemId as jest.Mock).mockResolvedValue('existing-item');

    await expect(repository.linkContentId(project, 'content-1', 'token')).resolves.toBe('existing-item');
    expect(graphql).not.toHaveBeenCalled();
  });
});
