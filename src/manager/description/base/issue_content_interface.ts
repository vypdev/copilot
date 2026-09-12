import type { IssueDescriptionCommandPort, IssueDescriptionQueryPort } from "../../../application/ports/issue_description_ports";
import type { ExecutionConfigurationQuery } from '../../../application/ports/execution_configuration_ports';
import { logError } from "../../../utils/logger";
import { ContentInterface } from "./content_interface";
import { toApplicationError } from '../../../application/errors/application_error';

export abstract class IssueContentInterface extends ContentInterface {
    constructor(protected readonly issueDescriptionPort: IssueDescriptionQueryPort & IssueDescriptionCommandPort) {
        super();
    }

    internalGetter = async (query: ExecutionConfigurationQuery): Promise<string | undefined> => {
        try {
            const description = await this.issueDescriptionPort.getDescription(
                query.owner,
                query.repository,
                query.issueNumber,
                query.token,
            );

            return this.getContent(description);
        } catch (error) {
            logError(toApplicationError(error, 'provider.unavailable', 'Unable to read issue content.'));
            throw error;
        }
    }

    internalUpdate = async (query: ExecutionConfigurationQuery, content: string): Promise<string | undefined> => {
        try {
            const description = await this.issueDescriptionPort.getDescription(
                query.owner,
                query.repository,
                query.issueNumber,
                query.token,
            );

            const updated = this.updateContent(description, content);
            if (updated === undefined) {
                throw new Error('Issue content markers are missing or inconsistent.');
            }

            await this.issueDescriptionPort.updateDescription(
                query.owner,
                query.repository,
                query.issueNumber,
                updated,
                query.token,
            );

            return updated;
        } catch (error) {
            logError(toApplicationError(error, 'provider.unavailable', 'Unable to update issue content.'));
            throw error;
        }
    }
}
