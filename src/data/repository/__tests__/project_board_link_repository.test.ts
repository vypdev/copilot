import { ProjectBoardLinkRepository } from '../project/project_board_link_repository';
import { ProjectDetail } from '../../model/project_detail';
import type { ProjectBoardQueryPort } from '../../../application/ports/project_board_query_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';

describe('ProjectBoardLinkRepository', () => {
  const project = new ProjectDetail({ id: 'project-1' });
  const queryPort = { isContentLinked: jest.fn() } as unknown as ProjectBoardQueryPort;
  const graphql = jest.fn();
  const graphqlPort = {
    getClient: jest.fn(() => ({ graphql })),
  } as unknown as GithubClientPort<GithubGraphqlTransportClient>;
  let repository: ProjectBoardLinkRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new ProjectBoardLinkRepository(queryPort, graphqlPort);
    (queryPort.isContentLinked as jest.Mock).mockResolvedValue(false);
  });

  it('returns true only when GitHub returns the created project item id', async () => {
    graphql.mockResolvedValue({ addProjectV2ItemById: { item: { id: 'item-1' } } });

    await expect(repository.linkContentId(project, 'content-1', 'token')).resolves.toBe(true);
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it('returns false when the mutation response does not contain a created item', async () => {
    graphql.mockResolvedValue({ addProjectV2ItemById: {} });

    await expect(repository.linkContentId(project, 'content-1', 'token')).resolves.toBe(false);
  });

  it('does not mutate an already linked content item', async () => {
    (queryPort.isContentLinked as jest.Mock).mockResolvedValue(true);

    await expect(repository.linkContentId(project, 'content-1', 'token')).resolves.toBe(false);
    expect(graphql).not.toHaveBeenCalled();
  });
});
