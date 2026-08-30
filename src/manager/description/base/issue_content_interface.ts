import { Execution } from "../../../data/model/execution";
import type { IssueDescriptionCommandPort, IssueDescriptionQueryPort } from "../../../application/ports/issue_description_ports";
import { logError } from "../../../utils/logger";
import { ContentInterface } from "./content_interface";
import { resolveReadContentNumber, resolveWriteContentNumber } from './issue_content_number_policy';

export abstract class IssueContentInterface extends ContentInterface {
    constructor(protected readonly issueDescriptionPort: IssueDescriptionQueryPort & IssueDescriptionCommandPort) {
        super();
    }

    internalGetter = async (execution: Execution): Promise<string | undefined> => {
        try {
            const number = resolveReadContentNumber(execution);
            if (number === undefined) return undefined;

            const description = await this.issueDescriptionPort.getDescription(
                execution.owner,
                execution.repo,
                number,
                execution.tokens.token,
            );

            return this.getContent(description);
        } catch (error) {
            logError(`Error reading issue configuration: ${error}`);
            throw error;
        }
    }

    internalUpdate = async (execution: Execution, content: string): Promise<string | undefined> => {
        try {
            const number = resolveWriteContentNumber(execution);
            if (number === undefined) return undefined;

            const description = await this.issueDescriptionPort.getDescription(
                execution.owner,
                execution.repo,
                number,
                execution.tokens.token,
            );

            const updated = this.updateContent(description, content);
            if (updated === undefined) {
                return undefined
            }

            await this.issueDescriptionPort.updateDescription(
                execution.owner,
                execution.repo,
                number,
                updated,
                execution.tokens.token,
            );

            return updated;
        } catch (error) {
            logError(`Error reading issue configuration: ${error}`);
            throw error;
        }
    }
}
