import type { BoundBugbotContextReadPorts } from '../../application/ports/bugbot_context_ports';
import type { SddDiffQueryPort, SddDiffRequest } from '../../application/ports/sdd_diff_read_ports';
import { SddEvidenceQueryUseCase } from '../../application/usecases/sdd/sdd_evidence_query_use_case';
import { SddDiffQueryUseCase } from '../../application/usecases/sdd/sdd_diff_query_use_case';
import { SddDiffLinkRepository } from '../../data/repository/sdd/sdd_diff_link_repository';
import { PreBranchSddWorkspaceAdapter } from '../pre_branch_sdd_workspace_adapter';
import type { BugbotScmBinding } from './bugbot_scm_port_factory';
import { createSddEvidenceReadPorts } from './sdd_evidence_composition_root';
import { createGraphqlTransportClient } from './github_project_client_factory';

/** No agent, provisioning, approval or lifecycle writer is supplied. */
export function createSddDiffQueryPort(binding: BugbotScmBinding, comments: Pick<BoundBugbotContextReadPorts, 'listIssueComments'>): SddDiffQueryPort {
  const bound = Object.freeze({ ...binding });
  const reads = createSddEvidenceReadPorts(bound, comments);
  const evidence = new SddEvidenceQueryUseCase(reads);
  const documents = new PreBranchSddWorkspaceAdapter(process.cwd(), bound.token);
  const client = createGraphqlTransportClient();
  return Object.freeze({ serverOrigin: process.env.GITHUB_SERVER_URL ?? 'https://github.com',
    read: (request: SddDiffRequest) => new SddDiffQueryUseCase({ evidence: Object.freeze({ read: evidence.read.bind(evidence) }),
      links: new SddDiffLinkRepository(client, { ...bound, repositoryId: request.repositoryId }),
      labels: reads.labels, descriptions: reads.descriptions,
      documents: Object.freeze({ readSdd: documents.readSdd.bind(documents) }),
    }).read(request),
  });
}
