import type { LatestTagQueryPort } from '../../application/ports/branch_tag_ports';
import type { MessageCatalogResolutionPort } from '../../application/ports/message_catalog_ports';
import { ResolveMessageCatalogUseCase } from '../../application/usecases/localization/resolve_message_catalog_use_case';
import { GitCliRepository } from '../../data/repository/git_cli_repository';
import { createProjectBoardCompositionRoot, type ProjectBoardComposition } from './project_board_composition_root';
import { createLanguageQueryPort } from './agent_capability_composition_root';

export interface LocalActionCompositionRoot {
    projectBoard: ProjectBoardComposition;
    latestTagQuery: LatestTagQueryPort;
    catalogResolver: MessageCatalogResolutionPort;
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
        catalogResolver: new ResolveMessageCatalogUseCase(createLanguageQueryPort()),
    };
}
