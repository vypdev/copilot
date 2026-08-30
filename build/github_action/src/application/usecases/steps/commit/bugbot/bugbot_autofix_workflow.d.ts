import { Result } from '../../../../../data/model/result';
import type { BugbotAutofixParam, BugbotAutofixWorkflowDependencies } from './bugbot_autofix_contracts';
export type { BugbotAutofixParam, BugbotAutofixWorkflowDependencies } from './bugbot_autofix_contracts';
/** Coordinates preflight, agent execution and postflight workspace safety. */
export declare function runBugbotAutofixWorkflow(param: BugbotAutofixParam, dependencies: BugbotAutofixWorkflowDependencies): Promise<Result[]>;
