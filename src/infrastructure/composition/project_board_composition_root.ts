import { createGraphqlTransportClient, createOwnerTypeClient, createRepositoryContextClient } from './github_project_client_factory';
import type { ProjectBoardCommandPort } from '../../application/ports/project_board_command_ports';
import type { ProjectBoardLinkPort } from '../../application/ports/project_board_link_ports';
import type { ProjectBoardQueryPort } from '../../application/ports/project_board_query_ports';
import { ProjectBoardCommandRepository } from '../../data/repository/project/project_board_command_repository';
import { ProjectBoardLinkRepository } from '../../data/repository/project/project_board_link_repository';
import { ProjectBoardQueryRepository } from '../../data/repository/project/project_board_query_repository';

export interface ProjectBoardComposition {
    query: ProjectBoardQueryPort;
    link: ProjectBoardLinkPort;
    command: ProjectBoardCommandPort;
}

export function createProjectBoardCompositionRoot(): ProjectBoardComposition {
    const query = new ProjectBoardQueryRepository(
        createRepositoryContextClient(),
        createOwnerTypeClient(),
        createGraphqlTransportClient(),
    );
    return {
        query,
        link: new ProjectBoardLinkRepository(query, createGraphqlTransportClient()),
        command: new ProjectBoardCommandRepository(query, createGraphqlTransportClient()),
    };
}
