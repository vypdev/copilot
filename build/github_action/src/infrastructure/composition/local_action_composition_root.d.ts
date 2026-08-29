import type { LatestTagQueryPort } from '../../application/ports/branch_tag_ports';
import { type ProjectBoardComposition } from './project_board_composition_root';
export interface LocalActionCompositionRoot {
    projectBoard: ProjectBoardComposition;
    latestTagQuery: LatestTagQueryPort;
}
/**
 * Owns the concrete dependencies shared by the local action lifecycle.
 * Keeping them in one root preserves the project-board query/command scope and
 * prevents the CLI-facing entrypoint from constructing infrastructure directly.
 */
export declare function createLocalActionCompositionRoot(): LocalActionCompositionRoot;
