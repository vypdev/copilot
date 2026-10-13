import type { BoundProjectBoardMembershipQueryPort } from '../../application/ports/project_board_query_ports';
import type { RepositoryCredentialBinding } from './shared_capability_port_binding';
import { ProjectDetail } from '../../data/model/project_detail';
import { isProjectContentLinked } from '../../data/repository/project/project_board_item_query';
import { createGraphqlTransportClient } from './github_project_client_factory';

/** Bind credentials outside the application's physically read-only facade. */
export function createChangeSizeProjectMembershipQueryPort(
    binding: RepositoryCredentialBinding,
): BoundProjectBoardMembershipQueryPort {
    const client = createGraphqlTransportClient().getClient(binding.token);
    return Object.freeze({
        isContentLinked: (project, contentNumber) => isProjectContentLinked(
            client, new ProjectDetail(project), binding.owner, binding.repository, contentNumber,
        ),
    } satisfies BoundProjectBoardMembershipQueryPort);
}
