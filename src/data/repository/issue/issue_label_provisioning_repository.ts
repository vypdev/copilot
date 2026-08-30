import type {
    InitialLabelProvisioningPort,
    LabelProvisioningSummary,
} from "../../../application/ports/issue_management_ports";
import {
    buildInitialLabelProvisioningPlan,
    type InitialLabelDefinition,
    type LabelProvisioningGroupPlan,
} from "../../../application/policies/initial_label_provisioning_policy";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubIssueLabelProvisioningClient } from "../../../infrastructure/github/ports/github_issue_label_provisioning_protocol";
import { logError } from "../../../utils/logger";
import { Labels } from "../../model/labels";
import { isGithubAlreadyExists } from "../github/github_error_policy";
import { requireArrayPage } from "../github/github_pagination_policy";

interface RepositoryLabel {
    name: string;
    color: string;
    description: string | null;
}

interface LabelProvisioningContext {
    client: GithubIssueLabelProvisioningClient;
    owner: string;
    repository: string;
}

type LabelMutationOutcome =
    | { kind: 'created' }
    | { kind: 'existing' }
    | { kind: 'failed'; error: string };

export class IssueLabelProvisioningRepository implements InitialLabelProvisioningPort {
    constructor(private readonly githubClient: GithubClientPort<GithubIssueLabelProvisioningClient>) {}

    ensureInitialLabels = async (
        owner: string,
        repository: string,
        labels: Labels,
        token: string,
    ): Promise<{
        configured: LabelProvisioningSummary;
        progress: LabelProvisioningSummary;
    }> => {
        const client = this.githubClient.getClient(token);
        const inventory = await this.listLabelsForRepo(client, owner, repository);
        const plan = buildInitialLabelProvisioningPlan(
            labels,
            inventory.map(label => label.name),
        );

        const context: LabelProvisioningContext = { client, owner, repository };

        return {
            configured: await this.provisionMissingLabels(context, plan.configured),
            progress: await this.provisionMissingLabels(context, plan.progress),
        };
    };

    private listLabelsForRepo = async (
        client: GithubIssueLabelProvisioningClient,
        owner: string,
        repository: string,
    ): Promise<RepositoryLabel[]> => {
        const labels: RepositoryLabel[] = [];
        for await (const page of client.paginate.iterator(
            client.rest.issues.listLabelsForRepo,
            { owner, repo: repository, per_page: 100 },
        )) {
            const labelsPage = requireArrayPage<RepositoryLabel>(page.data, 'repository labels');
            labels.push(...labelsPage.map(label => ({
                name: label.name,
                color: label.color,
                description: label.description ?? null,
            })));
        }
        return labels;
    };

    private provisionMissingLabels = async (
        context: LabelProvisioningContext,
        plan: LabelProvisioningGroupPlan,
    ): Promise<LabelProvisioningSummary> => {
        const outcomes: LabelMutationOutcome[] = [];
        for (const definition of plan.missing) {
            outcomes.push(await this.provisionLabel(context, definition));
        }
        return {
            created: outcomes.filter(outcome => outcome.kind === 'created').length,
            existing: plan.existing + outcomes.filter(outcome => outcome.kind === 'existing').length,
            errors: outcomes.flatMap(outcome => outcome.kind === 'failed' ? [outcome.error] : []),
        };
    };

    private provisionLabel = async (
        context: LabelProvisioningContext,
        definition: InitialLabelDefinition,
    ): Promise<LabelMutationOutcome> => {
        try {
            await context.client.rest.issues.createLabel({
                owner: context.owner,
                repo: context.repository,
                name: definition.name,
                color: definition.color,
                description: definition.description,
            });
            return { kind: 'created' };
        } catch (error: unknown) {
            return mapLabelMutationError(definition.name, error);
        }
    };
}

function mapLabelMutationError(name: string, error: unknown): LabelMutationOutcome {
    if (isGithubAlreadyExists(error)) return { kind: 'existing' };
    const summaryError = `Error creating label "${name}": ${providerErrorMessage(error)}`;
    logError(summaryError);
    return { kind: 'failed', error: summaryError };
}

function providerErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}
