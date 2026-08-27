const createRepositoryContextClient = jest.fn(() => ({ kind: 'repository-context' }));
const createOwnerTypeClient = jest.fn(() => ({ kind: 'owner-type' }));
const createGraphqlTransportClient = jest.fn(() => ({ kind: 'graphql' }));

jest.mock('../github_project_client_factory', () => ({
  createRepositoryContextClient,
  createOwnerTypeClient,
  createGraphqlTransportClient,
}));

const queryInstances: unknown[] = [];
const linkInstances: unknown[] = [];
const commandInstances: unknown[] = [];

jest.mock('../../../data/repository/project/project_board_query_repository', () => ({
  ProjectBoardQueryRepository: jest.fn().mockImplementation((...args: unknown[]) => {
    const instance = { kind: 'query', args };
    queryInstances.push(instance);
    return instance;
  }),
}));
jest.mock('../../../data/repository/project/project_board_link_repository', () => ({
  ProjectBoardLinkRepository: jest.fn().mockImplementation((...args: unknown[]) => {
    const instance = { kind: 'link', args };
    linkInstances.push(instance);
    return instance;
  }),
}));
jest.mock('../../../data/repository/project/project_board_command_repository', () => ({
  ProjectBoardCommandRepository: jest.fn().mockImplementation((...args: unknown[]) => {
    const instance = { kind: 'command', args };
    commandInstances.push(instance);
    return instance;
  }),
}));

import { createProjectBoardCompositionRoot } from '../project_board_composition_root';

describe('project board composition root', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryInstances.length = 0;
    linkInstances.length = 0;
    commandInstances.length = 0;
  });

  it('composes query, link and command capabilities with the shared query port', () => {
    const composition = createProjectBoardCompositionRoot();

    expect(composition.query).toBe(queryInstances[0]);
    expect(composition.link).toBe(linkInstances[0]);
    expect(composition.command).toBe(commandInstances[0]);
    expect((linkInstances[0] as { args: unknown[] }).args[0]).toBe(queryInstances[0]);
    expect((commandInstances[0] as { args: unknown[] }).args[0]).toBe(queryInstances[0]);
    expect(createRepositoryContextClient).toHaveBeenCalledTimes(1);
    expect(createOwnerTypeClient).toHaveBeenCalledTimes(1);
    expect(createGraphqlTransportClient).toHaveBeenCalledTimes(3);
  });
});
