import type { ExecutionConfigurationQuery } from '../../application/ports/execution_configuration_ports';
import { logError } from "../../utils/logger";
import { IssueContentInterface } from "./base/issue_content_interface";
import { toApplicationError } from '../../application/errors/application_error';

export class MarkdownContentHotfixHandler extends IssueContentInterface {
    get id(): string {
        return 'markdown_content_hotfix_handler';
    }

    get visibleContent(): boolean {
        return true;
    }

    update = async (query: ExecutionConfigurationQuery, content: string) => {
        try {
            return await this.internalUpdate(query, content)
        } catch (error) {
            logError(toApplicationError(error, 'provider.unavailable', 'Unable to update issue content.'));
            return undefined;
        }
    }

    get = async (query: ExecutionConfigurationQuery): Promise<string | undefined> => {
        try {
            const content = await this.internalGetter(query)
            if (content === undefined) {
                return undefined;
            }
            return content;
        } catch (error) {
            logError(toApplicationError(error, 'provider.unavailable', 'Unable to read issue content.'));
            throw error;
        }
    }
}
