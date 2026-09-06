import type { Execution } from '../../../../../data/model/execution';
import type { BugbotContextPorts } from '../../../../ports/bugbot_context_ports';
import type { BugbotContext } from './types';
export declare function expectedBugbotHeadSha(execution: Execution): string | undefined;
export declare function isLoadedBugbotRevisionSuperseded(context: BugbotContext, expectedHeadSha: string | undefined): boolean;
/** Re-reads the remote head immediately before publication to close the analysis race window. */
export declare function hasNewerBugbotRevision(execution: Execution, context: BugbotContext, ports: BugbotContextPorts): Promise<boolean>;
