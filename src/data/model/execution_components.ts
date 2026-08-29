import type { Ai } from './ai';
import type { Branches } from './branches';
import type { Emoji } from './emoji';
import type { Hotfix } from './hotfix';
import type { Images } from './images';
import type { Issue } from './issue';
import type { IssueTypes } from './issue_types';
import type { Labels } from './labels';
import type { Locale } from './locale';
import type { Projects } from './projects';
import type { PullRequest } from './pull_request';
import type { Release } from './release';
import type { SingleAction } from './single_action';
import type { SizeThresholds } from './size_thresholds';
import type { Tokens } from './tokens';
import type { Welcome } from './welcome';
import type { Workflows } from './workflows';
import type { ExecutionInputs } from './execution_inputs';

/** Immutable construction contract for the runtime execution aggregate. */
export interface ExecutionComponents {
    debug: boolean;
    singleAction: SingleAction;
    commitPrefixBuilder: string;
    issue: Issue;
    pullRequest: PullRequest;
    emoji: Emoji;
    images: Images;
    tokens: Tokens;
    ai: Ai;
    labels: Labels;
    issueTypes: IssueTypes;
    locale: Locale;
    sizeThresholds: SizeThresholds;
    branches: Branches;
    release: Release;
    hotfix: Hotfix;
    workflows: Workflows;
    projects: Projects;
    welcome?: Welcome;
    inputs?: ExecutionInputs;
}
