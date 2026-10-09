import type { SetupGithubIdentity, SetupGithubIdentityQueryPort } from '../../ports/setup_pat_identity_ports';
import { SetupWorkflowPatIdentityMismatchError } from '../../errors/setup_workflow_pat_identity_mismatch_error';

/** Binds a guided runtime PAT to the bot account chosen before token entry. */
export class VerifyGuidedWorkflowPatIdentityUseCase {
    constructor(private readonly identities: SetupGithubIdentityQueryPort) {}

    async execute(expected: SetupGithubIdentity, workflowToken: string): Promise<SetupGithubIdentity> {
        const actual = await this.identities.identify(workflowToken);
        if (actual.id !== expected.id) {
            throw new SetupWorkflowPatIdentityMismatchError(expected, actual);
        }
        return expected;
    }
}
