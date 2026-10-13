import type { ProjectBoardContentQueryPort } from '../../../application/ports/project_board_query_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
import { PROJECT_BOARD_ITEM_PAGE_LIMIT } from '../../../infrastructure/github/project_board_provider_limits';
import { logDebugInfo, logError } from '../../../utils/logger';
import type { ProjectDetail } from '../../model/project_detail';
import type { ProjectStatusInitialization } from '../../../application/ports/project_board_link_ports';
import { paginateCursor, type CursorPage } from '../github/github_pagination_adapter';

interface SingleSelectFieldNode {
    id: string;
    name: string;
    options?: Array<{ id: string; name: string }>;
}

interface ProjectItemNode {
    id: string;
    fieldValues?: {
        nodes: Array<{ field?: { name: string }; optionId?: string }>;
    };
}

interface ProjectFieldResponse {
    node: { fields?: CursorPage<SingleSelectFieldNode> } | null;
}

interface ProjectItemResponse {
    node: { items?: CursorPage<ProjectItemNode> } | null;
}

interface FieldOption {
    fieldId: string;
    optionId: string;
}

const FIELD_QUERY = `
    query($projectId: ID!, $after: String) {
      node(id: $projectId) {
        ... on ProjectV2 {
          fields(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name }
              }
            }
          }
        }
      }
    }`;

const ITEM_QUERY = `
    query($projectId: ID!, $after: String) {
      node(id: $projectId) {
        ... on ProjectV2 {
          items(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              fieldValues(first: 100) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    field { ... on ProjectV2SingleSelectField { name } }
                    optionId
                  }
                }
              }
            }
          }
        }
      }
    }`;

const UPDATE_FIELD_MUTATION = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $optionId }
        }
      ) {
        projectV2Item { id }
      }
    }`;

/** Updates one ProjectV2 single-select field only when the desired value differs. */
export async function setProjectBoardSingleSelectField(
    contentQueryPort: ProjectBoardContentQueryPort,
    graphqlClient: GithubClientPort<GithubGraphqlTransportClient>,
    project: ProjectDetail,
    owner: string,
    repo: string,
    issueOrPullRequestNumber: number,
    fieldName: string,
    fieldValue: string,
    token: string,
): Promise<boolean> {
    const contentId = await contentQueryPort.getProjectItemId(
        project,
        owner,
        repo,
        issueOrPullRequestNumber,
        token,
    );
    if (!contentId) {
        const message = `Content ID not found for issue or pull request #${issueOrPullRequestNumber}.`;
        logError(message);
        throw new Error(message);
    }

    const client = graphqlClient.getClient(token);
    const target = await findFieldOption(client, project, fieldName, fieldValue);
    const currentItem = await findProjectItem(client, project, contentId, fieldName);
    const currentFieldValue = currentItem.fieldValues?.nodes.find(
        (value) => value.field?.name === fieldName,
    );
    if (currentFieldValue?.optionId === target.optionId) {
        logDebugInfo(`Field '${fieldName}' is already set to '${fieldValue}'. No update needed.`);
        return false;
    }
    const updated = await updateProjectBoardSingleSelectField(client, project, contentId, target);
    if (!updated) {
        throw new Error(`Project item ${contentId} was not returned after updating field '${fieldName}'.`);
    }
    if (fieldName !== 'Status') return true;
    const updatedItem = await findProjectItem(client, project, contentId, fieldName);
    const updatedValue = updatedItem.fieldValues?.nodes.find(
        (value) => value.field?.name === fieldName,
    );
    if (updatedValue?.optionId !== target.optionId) {
        throw new Error(`Project field '${fieldName}' was not verified as '${fieldValue}' after update.`);
    }
    return true;
}

/** Updates a ProjectV2 item returned by the link mutation without waiting for list propagation. */
export async function setProjectBoardSingleSelectFieldByItemId(
    graphqlClient: GithubClientPort<GithubGraphqlTransportClient>,
    project: ProjectDetail,
    projectItemId: string,
    fieldName: string,
    fieldValue: string,
    token: string,
): Promise<boolean> {
    const client = graphqlClient.getClient(token);
    const target = await findFieldOption(client, project, fieldName, fieldValue);
    return updateProjectBoardSingleSelectField(client, project, projectItemId, target);
}

/** Reads the authoritative item directly, so replay and failed initialization never reset an existing status. */
export async function initializeProjectBoardItemStatus(
    graphqlClient: GithubClientPort<GithubGraphqlTransportClient>,
    project: ProjectDetail,
    projectItemId: string,
    columnName: string,
    token: string,
): Promise<ProjectStatusInitialization> {
    const client = graphqlClient.getClient(token);
    const result = await client.graphql<{
        node?: { project?: { id?: string }; fieldValueByName?: { optionId?: string } | null } | null;
    }>(`query($itemId: ID!) {
        node(id: $itemId) {
            ... on ProjectV2Item {
                project { id }
                fieldValueByName(name: "Status") {
                    ... on ProjectV2ItemFieldSingleSelectValue { optionId }
                }
            }
        }
    }`, { itemId: projectItemId });
    const item = result.node;
    if (item?.project?.id !== project.id || !Object.prototype.hasOwnProperty.call(item, 'fieldValueByName')) {
        throw new Error('The linked project item has no verified status evidence.');
    }
    if (item.fieldValueByName !== null) {
        if (!item.fieldValueByName?.optionId?.trim()) throw new Error('The linked project item status is malformed.');
        return 'retained';
    }
    const target = await findFieldOption(client, project, 'Status', columnName);
    return await updateProjectBoardSingleSelectField(client, project, projectItemId, target) ? 'initialized' : 'failed';
}

async function updateProjectBoardSingleSelectField(
    client: GithubGraphqlTransportClient,
    project: ProjectDetail,
    projectItemId: string,
    target: FieldOption,
): Promise<boolean> {
    const mutationResult = await client.graphql<{
        updateProjectV2ItemFieldValue?: { projectV2Item?: { id: string } } | null;
    }>(UPDATE_FIELD_MUTATION, {
        projectId: project.id,
        itemId: projectItemId,
        fieldId: target.fieldId,
        optionId: target.optionId,
    });
    return mutationResult.updateProjectV2ItemFieldValue?.projectV2Item?.id === projectItemId;
}

async function findFieldOption(
    client: GithubGraphqlTransportClient,
    project: ProjectDetail,
    fieldName: string,
    fieldValue: string,
): Promise<FieldOption> {
    for await (const page of paginateCursor(
        async (after) => {
            const result = await client.graphql<ProjectFieldResponse>(FIELD_QUERY, {
                projectId: project.id,
                after,
            });
            if (!result.node) throw new Error(`Project ${project.id} was not found while reading single-select fields.`);
            return result.node.fields ?? {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
            };
        },
        { description: 'project board fields' },
    )) {
        const field = page.nodes.find(
            (candidate) => candidate.name === fieldName && Array.isArray(candidate.options),
        );
        if (!field) continue;
        const option = field.options?.find((candidate) => candidate.name === fieldValue);
        if (!option) {
            const message = `Option '${fieldValue}' not found for field '${fieldName}'.`;
            logError(message);
            throw new Error(message);
        }
        logDebugInfo(`Target field ID: ${field.id}`);
        logDebugInfo(`Target option ID: ${option.id}`);
        return { fieldId: field.id, optionId: option.id };
    }
    const message = `Field '${fieldName}' not found or is not a single-select field.`;
    logError(message);
    throw new Error(message);
}

async function findProjectItem(
    client: GithubGraphqlTransportClient,
    project: ProjectDetail,
    itemId: string,
    fieldName: string,
): Promise<ProjectItemNode> {
    for await (const page of paginateCursor(
        async (after) => {
            const result = await client.graphql<ProjectItemResponse>(ITEM_QUERY, {
                projectId: project.id,
                after,
            });
            if (!result.node) throw new Error(`Project ${project.id} was not found while reading project items.`);
            return result.node.items ?? {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
            };
        },
        { description: 'project board items', maxPages: PROJECT_BOARD_ITEM_PAGE_LIMIT },
    )) {
        const item = page.nodes.find((candidate) => candidate.id === itemId);
        if (item) return item;
    }
    const result = await client.graphql<{
        node?: { id?: string; __typename?: string; project?: { id?: string }; fieldValueByName?: { optionId?: string } | null } | null;
    }>(`query($itemId: ID!, $fieldName: String!) {
        node(id: $itemId) {
            id __typename
            ... on ProjectV2Item {
                project { id }
                fieldValueByName(name: $fieldName) {
                    ... on ProjectV2ItemFieldSingleSelectValue { optionId }
                }
            }
        }
    }`, { itemId, fieldName });
    const item = result.node;
    if (item?.id !== itemId || item.__typename !== 'ProjectV2Item' || item.project?.id !== project.id
        || !Object.prototype.hasOwnProperty.call(item, 'fieldValueByName')) {
        throw new Error(`Project item ${itemId} has no verified field evidence in project ${project.id}.`);
    }
    const value = item.fieldValueByName;
    if (value !== null && (typeof value?.optionId !== 'string' || !value.optionId.trim())) {
        throw new Error('The direct Project item single-select value is malformed.');
    }
    return { id: itemId, fieldValues: { nodes: value === null ? [] : [{ field: { name: fieldName }, optionId: value.optionId }] } };
}
