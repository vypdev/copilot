import type { LatestTagQueryPort } from '../../application/ports/branch_tag_ports';
import { GitCliRepository } from '../../data/repository/git_cli_repository';
import { createProjectBoardCompositionRoot, type ProjectBoardComposition } from './project_board_composition_root';

export interface LocalActionCompositionRoot {
    projectBoard: ProjectBoardComposition;
    latestTagQuery: LatestTagQueryPort;
}

/**
 * Owns the concrete dependencies shared by the local action lifecycle.
 * Keeping them in one root preserves the project-board query/command scope and
 * prevents the CLI-facing entrypoint from constructing infrastructure directly.
 */
export function createLocalActionCompositionRoot(): LocalActionCompositionRoot {
    const projectBoard = createProjectBoardCompositionRoot();
    return {
        projectBoard,
        latestTagQuery: new GitCliRepository(),
    };
}
