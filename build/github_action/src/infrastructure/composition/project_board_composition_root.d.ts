import type { ProjectBoardCommandPort } from '../../application/ports/project_board_command_ports';
import type { ProjectBoardLinkPort } from '../../application/ports/project_board_link_ports';
import type { ProjectBoardQueryPort } from '../../application/ports/project_board_query_ports';
export interface ProjectBoardComposition {
    query: ProjectBoardQueryPort;
    link: ProjectBoardLinkPort;
    command: ProjectBoardCommandPort;
}
export declare function createProjectBoardCompositionRoot(): ProjectBoardComposition;
