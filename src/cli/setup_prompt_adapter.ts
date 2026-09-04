import { createInterface, type Interface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type {
    SetupCredentialPromptPort,
    SetupStoragePromptPort,
    SetupPromptPort,
    SetupWorkflowUpdatePromptPort,
    DoctorOutputPort,
} from '../application/ports/setup_wizard_ports';
import {
    SETUP_AGENT_TASKS,
    SETUP_FEATURE_DESCRIPTIONS,
} from '../application/policies/setup_configuration_policy';
import type {
    SetupAgentRoleConfiguration,
    SetupConfiguration,
    SetupPlan,
    SetupCredentialCheck,
    SetupCredentialRequirement,
    SetupCredentialDecision,
    SetupCredentialValue,
    SetupWorkflowComparison,
    SetupResourceStoragePolicy,
    SetupStorageConfiguration,
    SetupRemoteConfiguration,
    SetupVariable,
} from '../domain/setup';

const AGENT_PROVIDERS = ['codex', 'opencode', 'cursor'] as const;
const MODEL_PROVIDERS = ['openai', 'anthropic', 'google', 'openrouter', 'opencode', 'local'] as const;

export interface SetupPromptAdapterOptions {
    interactive?: boolean;
    assumeYes?: boolean;
    credentialValues?: Record<string, string>;
}

export class SetupPromptAdapter implements SetupPromptPort, SetupCredentialPromptPort, SetupStoragePromptPort, SetupWorkflowUpdatePromptPort, DoctorOutputPort {
    private readonly interactive: boolean;
    private readonly assumeYes: boolean;
    private readonly readline: Interface | undefined;
    private readonly credentialValues: Readonly<Record<string, string>>;

    constructor(options: SetupPromptAdapterOptions = {}) {
        this.interactive = Boolean(
            (options.interactive ?? Boolean(stdin.isTTY && stdout.isTTY))
            && stdin.isTTY
            && stdout.isTTY
            && !process.env.JEST_WORKER_ID,
        );
        this.assumeYes = options.assumeYes ?? false;
        this.credentialValues = options.credentialValues ?? {};
        this.readline = this.interactive ? createInterface({ input: stdin, output: stdout }) : undefined;
    }

    async collect(defaults: SetupConfiguration): Promise<SetupConfiguration> {
        if (!this.readline) return defaults;
        console.log(renderBox(
            'This wizard configures repository workflows, GitHub Variables, GitHub Secrets, AI agents, and operational defaults.\n\nThe setup PAT is an operator credential used only during this command. It is different from the workflow PAT that the bot account uses at runtime.',
            'Copilot Setup',
        ));
        console.log(color('\n1. Choose the capabilities to install\n', 36));
        for (const [feature, description] of Object.entries(SETUP_FEATURE_DESCRIPTIONS)) {
            defaults.features[feature] = await this.askBoolean(description, defaults.features[feature] !== false);
        }

        console.log(color('\n2. Choose one of the three supported agent runtimes for each task\n', 36));
        for (const task of SETUP_AGENT_TASKS) {
            defaults.agents[task].provider = await this.askChoice(
                `${formatTask(task)} runtime`,
                [...AGENT_PROVIDERS],
                defaults.agents[task].provider,
            ) as SetupAgentRoleConfiguration['provider'];
        }
        const modelProvider = await this.askChoice('Model provider for all tasks', [...MODEL_PROVIDERS], defaults.agents.findings.modelProvider);
        const model = await this.askText('Model name for all tasks', defaults.agents.findings.model);
        const effort = await this.askText('Reasoning effort for all tasks (leave empty for provider default)', defaults.agents.findings.effort ?? '');
        for (const task of SETUP_AGENT_TASKS) {
            defaults.agents[task].modelProvider = modelProvider;
            defaults.agents[task].model = model;
            defaults.agents[task].effort = effort;
        }
        if (await this.askBoolean('Configure model provider, model, and effort independently for every task?', false)) {
            for (const task of SETUP_AGENT_TASKS) {
                defaults.agents[task].modelProvider = await this.askText(`${formatTask(task)} model provider`, defaults.agents[task].modelProvider);
                defaults.agents[task].model = await this.askText(`${formatTask(task)} model`, defaults.agents[task].model);
                defaults.agents[task].effort = await this.askText(`${formatTask(task)} effort (empty for default)`, defaults.agents[task].effort ?? '');
            }
        }

        console.log(color('\n3. Configure repository behavior\n', 36));
        const repository = defaults.repository;
        repository.mainBranch = await this.askText('Production branch', repository.mainBranch);
        repository.developmentBranch = await this.askText('Development branch', repository.developmentBranch);
        repository.featureTree = await this.askText('Feature branch prefix', repository.featureTree);
        repository.bugfixTree = await this.askText('Bugfix branch prefix', repository.bugfixTree);
        repository.hotfixTree = await this.askText('Hotfix branch prefix', repository.hotfixTree);
        repository.releaseTree = await this.askText('Release branch prefix', repository.releaseTree);
        repository.docsTree = await this.askText('Documentation branch prefix', repository.docsTree);
        repository.choreTree = await this.askText('Chore branch prefix', repository.choreTree);
        repository.branchManagementAlways = await this.askBoolean('Create/manage branches without requiring the branched label?', repository.branchManagementAlways);
        repository.reopenIssueOnPush = await this.askBoolean('Reopen closed issues when a related branch receives a push?', repository.reopenIssueOnPush);
        repository.desiredAssigneesCount = await this.askNumber('Desired issue assignees (0 disables automatic assignment)', repository.desiredAssigneesCount);
        repository.desiredReviewersCount = await this.askNumber('Desired pull-request reviewers (0 disables automatic assignment)', repository.desiredReviewersCount);
        repository.mergeTimeout = await this.askNumber('Merge timeout in seconds (0 disables the timeout)', repository.mergeTimeout);
        repository.issueLocale = await this.askText('Issue comment locale', repository.issueLocale);
        repository.pullRequestLocale = await this.askText('Pull-request comment locale', repository.pullRequestLocale);
        repository.commitPrefixTransforms = await this.askText('Commit prefix transforms', repository.commitPrefixTransforms);

        console.log(color('\n4. Configure AI, projects, and release safety\n', 36));
        const ai = defaults.ai;
        ai.pullRequestDescription = await this.askBoolean('Generate AI pull-request descriptions?', ai.pullRequestDescription);
        ai.pullRequestDescriptionMode = await this.askChoice(
            'Pull-request description mode',
            ['replace', 'append', 'preserve', 'disabled'],
            ai.pullRequestDescriptionMode ?? 'replace',
        ) as SetupConfiguration['ai']['pullRequestDescriptionMode'];
        ai.ignoreFiles = await this.askText('AI ignore file patterns (comma-separated)', ai.ignoreFiles);
        ai.membersOnly = await this.askBoolean('Restrict AI processing to repository members?', ai.membersOnly);
        ai.includeReasoning = await this.askBoolean('Include agent reasoning where supported?', ai.includeReasoning);
        ai.bugbotSeverity = await this.askChoice('Minimum Bugbot severity to publish', ['info', 'low', 'medium', 'high'], ai.bugbotSeverity) as SetupConfiguration['ai']['bugbotSeverity'];
        ai.bugbotCommentLimit = await this.askNumber('Maximum Bugbot comments per run', ai.bugbotCommentLimit);
        ai.bugbotFixVerifyCommands = await this.askText('Bugbot autofix verification commands (comma-separated, empty is allowed)', ai.bugbotFixVerifyCommands);
        ai.provisioningMode = await this.askChoice('Agent CLI provisioning mode', ['auto', 'always', 'disabled'], ai.provisioningMode) as SetupConfiguration['ai']['provisioningMode'];
        defaults.projects.ids = await this.askText('GitHub Project IDs (comma-separated, empty to skip Projects integration)', defaults.projects.ids);
        if (defaults.projects.ids.trim()) {
            defaults.projects.issueCreatedColumn = await this.askText('Project column for new issues', defaults.projects.issueCreatedColumn);
            defaults.projects.pullRequestCreatedColumn = await this.askText('Project column for new pull requests', defaults.projects.pullRequestCreatedColumn);
            defaults.projects.issueInProgressColumn = await this.askText('Project column for issues in progress', defaults.projects.issueInProgressColumn);
            defaults.projects.pullRequestInProgressColumn = await this.askText('Project column for pull requests in progress', defaults.projects.pullRequestInProgressColumn);
        }
        defaults.createInitialTag = await this.askBoolean('Create v1.0.0 when the repository has no version tags?', defaults.createInitialTag);
        defaults.manageRepositoryVariables = await this.askBoolean('Create/update the non-sensitive GitHub Repository Variables used by the workflows?', defaults.manageRepositoryVariables);
        defaults.manageRepositorySecrets = await this.askBoolean('Validate and provision the GitHub Secrets required by the selected workflows?', defaults.manageRepositorySecrets);
        return defaults;
    }

    async chooseStorage(
        defaults: SetupStorageConfiguration,
        remote: SetupRemoteConfiguration,
        variables: readonly SetupVariable[],
        requirements: readonly SetupCredentialRequirement[],
        managed: { secrets: boolean; variables: boolean } = { secrets: true, variables: true },
    ): Promise<SetupStorageConfiguration> {
        if (!this.readline) return defaults;
        console.log(color('\n5. Review GitHub Actions resource scopes\n', 36));
        console.log(renderBox(renderRemoteConfiguration(remote, variables, requirements), 'Existing GitHub Actions resources', 33));

        const secrets = managed.secrets
            ? await this.chooseStoragePolicy('secrets', defaults.secrets, remote, requirements.map(requirement => requirement.name))
            : defaults.secrets;
        const configuredVariables = variables.map(variable => variable.name);
        const variableNames = configuredVariables.length > 0 ? configuredVariables : [];
        const variablesPolicy = managed.variables
            ? await this.chooseStoragePolicy('variables', defaults.variables, remote, variableNames)
            : defaults.variables;
        return { secrets, variables: variablesPolicy };
    }

    showPlan(plan: SetupPlan): void {
        const enabledFeatures = Object.entries(plan.configuration.features)
            .filter(([, enabled]) => enabled)
            .map(([feature]) => `  ${color('✓', 32)} ${SETUP_FEATURE_DESCRIPTIONS[feature] ?? feature}`)
            .join('\n');
        const agents = SETUP_AGENT_TASKS
            .map(task => `  ${formatTask(task)}: ${plan.configuration.agents[task].provider} / ${plan.configuration.agents[task].modelProvider}/${plan.configuration.agents[task].model}`)
            .join('\n');
        const content = [
            color('Capabilities', 36), enabledFeatures || '  (none)', '',
            color('Agent routing', 36), agents, '',
            color('Repository changes', 36),
            `  Files selected: ${plan.selectedFiles.length}`,
            `  Variables to upsert: ${plan.configuration.manageRepositoryVariables ? plan.variables.length : 0}`,
            `  Secrets to validate/provision: ${plan.configuration.manageRepositorySecrets ? plan.credentialRequirements.length : 0}`,
            `  Variable storage: ${plan.configuration.storage.variables.defaultScope} scope${plan.configuration.storage.variables.defaultScope === 'organization' ? ` (${plan.configuration.storage.variables.organizationVisibility})` : ''}`,
            `  Secret storage: ${plan.configuration.storage.secrets.defaultScope} scope${plan.configuration.storage.secrets.defaultScope === 'organization' ? ` (${plan.configuration.storage.secrets.organizationVisibility})` : ''}`,
            `  Labels and issue types: always checked by Copilot setup`,
            `  Initial tag: ${plan.configuration.createInitialTag ? 'v1.0.0 when no version tag exists' : 'disabled'}`, '',
            color('Credential contract', 33), `  ${plan.requiredSecrets.join(', ')}`,
            ...(plan.warnings.length > 0 ? ['', color('Important notes', 33), ...plan.warnings.map(warning => `  ⚠ ${warning}`)] : []),
        ].join('\n');
        console.log(renderBox(content, 'Setup Plan', 32));
    }

    async confirm(plan: SetupPlan): Promise<boolean> {
        if (this.assumeYes || !this.readline) return true;
        return this.askBoolean(`Apply this setup plan to ${plan.configuration.manageRepositoryVariables ? 'the repository and GitHub Variables' : 'the repository'}?`, false);
    }

    async requestSetupPat(): Promise<string | undefined> {
        if (!this.readline) return undefined;
        console.log(renderBox(
            'Enter a GitHub setup PAT. It is used in memory for this run only and is never stored in the repository, a .env file, or a GitHub Secret.\n\nRecommended fine-grained permissions for the selected setup features:\n  Repository: Metadata read, Contents read, Issues write, Actions read/write, Variables write, Secrets read/write, Workflows read/write.\n  Organization: Issue Types write and Projects read/write only when selected; Members read when member-only checks are enabled.\n  Contents write and Workflows write are needed only when changing workflow files through the GitHub API.\n\nThe workflow PAT is a different bot-account token and is requested separately.',
            'Setup PAT',
            33,
        ));
        return this.askSecret('Setup PAT');
    }

    explainCredentialSeparation(requirements: readonly SetupCredentialRequirement[]): void {
        if (!this.readline) return;
        console.log(renderBox(
            'The workflow PAT is not the setup PAT. The workflow PAT belongs to the bot account, is stored remotely as the PAT Secret, and is used by GitHub Actions to work on issues and pull requests. Existing Secrets are never readable through GitHub; Copilot can only validate them through the repository health workflow.',
            'Workflow credentials',
            33,
        ));
        console.log(`Required credentials: ${requirements.map(requirement => requirement.name).join(', ')}`);
    }

    async requestWorkflowPat(requirement: SetupCredentialRequirement, current?: SetupCredentialCheck): Promise<SetupCredentialValue | undefined> {
        return this.requestSecretForRequirement(requirement, current, 'workflow PAT owned by the bot account');
    }

    async requestApiKey(requirement: SetupCredentialRequirement, current?: SetupCredentialCheck): Promise<SetupCredentialValue | undefined> {
        return this.requestSecretForRequirement(requirement, current, `${requirement.provider ?? 'provider'} API key`);
    }

    async chooseExistingCredential(requirement: SetupCredentialRequirement, check: SetupCredentialCheck): Promise<SetupCredentialDecision> {
        if (this.credentialValues[requirement.name]?.trim()) return 'replace';
        if (!this.readline) return 'keep';
        console.log(`Existing ${requirement.name}: ${check.status}. ${check.message}`);
        return this.askChoice(
            `How should Copilot handle the existing ${requirement.name}?`,
            ['keep', 'replace', 'skip'],
            check.status === 'valid' ? 'keep' : 'replace',
        ) as Promise<SetupCredentialDecision>;
    }

    showCredentialChecks(checks: readonly SetupCredentialCheck[]): void {
        if (checks.length === 0) return;
        console.log(renderBox(
            checks.map(check => `  ${statusIcon(check.status)} ${check.name}: ${check.status} — ${check.message}`).join('\n'),
            'Credential validation',
            checks.some(check => check.status === 'invalid') ? 31 : 32,
        ));
    }

    showDoctorChecks(checks: readonly import('../domain/setup').DoctorCheck[]): void {
        const content = checks.map(check => `  ${doctorIcon(check.status)} ${check.area}: ${check.message}`).join('\n');
        console.log(renderBox(content || '  No checks were available.', 'Copilot Doctor', checks.some(check => check.status === 'fail') ? 31 : 32));
    }

    async confirmWorkflowUpdates(comparisons: readonly SetupWorkflowComparison[], forcedByFlag: boolean): Promise<boolean> {
        const changed = comparisons.filter(comparison => comparison.status === 'changed' || comparison.status === 'unmanaged');
        if (changed.length === 0) return false;
        if (!this.readline) return forcedByFlag;
        console.log(renderBox(
            changed.map(comparison => `  ${comparison.status === 'changed' ? '↻' : '⚠'} ${comparison.destination} (${comparison.status})`).join('\n'),
            'Existing workflows detected',
            33,
        ));
        if (forcedByFlag) {
            console.log('The --update-workflows flag was provided; these setup-managed workflows are eligible for update.');
            return true;
        }
        return this.askBoolean('Update the detected workflows with the configuration selected in this setup?', false);
    }

    close(): void {
        this.readline?.close();
    }

    private async askText(question: string, defaultValue: string): Promise<string> {
        const answer = await this.readline!.question(`${question} ${color(`[${defaultValue || 'none'}]`, 90)}: `);
        return answer.trim() || defaultValue;
    }

    private async requestSecretForRequirement(
        requirement: SetupCredentialRequirement,
        current: SetupCredentialCheck | undefined,
        label: string,
    ): Promise<SetupCredentialValue | undefined> {
        const supplied = this.credentialValues[requirement.name]?.trim();
        if (supplied) return { name: requirement.name, value: supplied };
        if (!this.readline) return undefined;
        if (current) {
            console.log(`${requirement.name}: ${current.status} (${current.message})`);
        }
        const value = await this.askSecret(`${requirement.name} — ${label}`);
        return value ? { name: requirement.name, value } : undefined;
    }

    private async askSecret(question: string): Promise<string> {
        const input = stdin as typeof stdin & { setRawMode?: (mode: boolean) => void };
        if (!input.isTTY || !input.setRawMode) {
            return (await this.readline!.question(`${question}: `)).trim();
        }
        stdout.write(`${question}: `);
        input.setRawMode(true);
        input.resume();
        return await new Promise<string>((resolve, reject) => {
            let value = '';
            const onData = (chunk: Buffer | string) => {
                const text = chunk.toString();
                for (const character of text) {
                    if (character === '\u0003') {
                        cleanup();
                        reject(new Error('Input cancelled.'));
                    } else if (character === '\r' || character === '\n') {
                        cleanup();
                        stdout.write('\n');
                        resolve(value.trim());
                    } else if (character === '\u007f') {
                        value = value.slice(0, -1);
                    } else {
                        value += character;
                    }
                }
            };
            const cleanup = () => {
                input.off('data', onData);
                input.setRawMode?.(false);
                input.pause();
            };
            input.on('data', onData);
        });
    }

    private async askNumber(question: string, defaultValue: number): Promise<number> {
        while (true) {
            const value = await this.askText(question, String(defaultValue));
            const parsed = Number(value);
            if (Number.isInteger(parsed) && parsed >= 0) return parsed;
            console.log(color('Please enter a non-negative whole number.', 33));
        }
    }

    private async askBoolean(question: string, defaultValue: boolean): Promise<boolean> {
        const answer = await this.readline!.question(`${question} ${color(`[${defaultValue ? 'Y' : 'N'}]`, 90)}: `);
        const normalized = answer.trim().toLowerCase();
        if (!normalized) return defaultValue;
        return ['y', 'yes', 'true'].includes(normalized);
    }

    private async askChoice(question: string, choices: readonly string[], defaultValue: string): Promise<string> {
        console.log(question);
        choices.forEach((choice, index) => console.log(`  ${index + 1}) ${choice}${choice === defaultValue ? color(' (default)', 90) : ''}`));
        while (true) {
            const answer = await this.readline!.question(`Select 1-${choices.length} ${color(`[${choices.indexOf(defaultValue) + 1}]`, 90)}: `);
            if (!answer.trim()) return defaultValue;
            const index = Number(answer) - 1;
            if (Number.isInteger(index) && choices[index]) return choices[index];
            console.log(color('Please select one of the listed options.', 33));
        }
    }

    private async chooseStoragePolicy(
        kind: 'secrets' | 'variables',
        defaults: SetupResourceStoragePolicy,
        remote: SetupRemoteConfiguration,
        names: readonly string[],
    ): Promise<SetupResourceStoragePolicy> {
        const label = kind === 'secrets' ? 'Secrets' : 'Variables';
        const defaultScope = await this.askChoice(
            `Where should new GitHub Actions ${label} be stored?`,
            ['repository', 'organization'],
            defaults.defaultScope,
        ) as SetupResourceStoragePolicy['defaultScope'];
        const organizationVisibility = (defaultScope === 'organization' || Object.values(defaults.overrides).includes('organization'))
            ? await this.askChoice(
                `How should organization ${label} be shared?`,
                ['selected', 'private', 'all'],
                defaults.organizationVisibility,
            ) as SetupResourceStoragePolicy['organizationVisibility']
            : defaults.organizationVisibility;
        const preserveExisting = await this.askBoolean(
            `Preserve existing effective ${label} instead of creating a shadowing override?`,
            defaults.preserveExisting,
        );
        const organizationNames = kind === 'secrets'
            ? remote.organizationSecrets
            : remote.organizationVariables.map(variable => variable.name);
        const repositoryNames = kind === 'secrets'
            ? remote.repositorySecrets
            : remote.repositoryVariables.map(variable => variable.name);
        const inherited = names.filter(name => organizationNames.includes(name) && !repositoryNames.includes(name));
        let overrides = { ...defaults.overrides };
        if (inherited.length > 0 && defaultScope === 'repository') {
            const overrideInput = await this.askText(
                `Organization ${label} available to this repository: ${inherited.join(', ')}. Repository override names (comma-separated, empty to inherit all)`,
                '',
            );
            const requested = new Set(overrideInput.split(',').map(name => name.trim()).filter(Boolean));
            overrides = {
                ...overrides,
                ...Object.fromEntries(inherited.filter(name => requested.has(name)).map(name => [name, 'repository'])),
            } as Record<string, SetupResourceStoragePolicy['defaultScope']>;
        }
        return { defaultScope, organizationVisibility, preserveExisting, overrides };
    }
}

function statusIcon(status: SetupCredentialCheck['status']): string {
    if (status === 'valid') return '✓';
    if (status === 'unverifiable') return '?';
    if (status === 'missing') return '!';
    if (status === 'not_required') return '–';
    return '✗';
}

function doctorIcon(status: import('../domain/setup').DoctorCheckStatus): string {
    return status === 'pass' ? '✓' : status === 'warn' ? '⚠' : '✗';
}

function formatTask(task: string): string {
    return task.charAt(0).toUpperCase() + task.slice(1);
}

function color(value: string, code: number): string {
    if (!stdout.isTTY) return value;
    return `\u001b[${code}m${value}\u001b[0m`;
}

function renderBox(content: string, title: string, borderCode = 36): string {
    const lines = [` ${title} `, ...content.split('\n').map(line => ` ${line}`)];
    const width = Math.max(...lines.map(line => stripAnsi(line).length)) + 1;
    const border = color(`╭${'─'.repeat(width)}╮`, borderCode);
    const bottom = color(`╰${'─'.repeat(width)}╯`, borderCode);
    return [
        border,
        ...lines.map(line => `${color('│', borderCode)}${line}${' '.repeat(Math.max(0, width - stripAnsi(line).length))}${color('│', borderCode)}`),
        bottom,
    ].join('\n');
}

function renderRemoteConfiguration(
    remote: SetupRemoteConfiguration,
    variables: readonly SetupVariable[],
    requirements: readonly SetupCredentialRequirement[],
): string {
    const lines = [
        `Target owner: ${remote.ownerType}; repository visibility: ${remote.repositoryVisibility}; repository ID: ${remote.repositoryId ?? 'unknown'}`,
        `Repository Secrets: ${remote.repositorySecrets.length > 0 ? remote.repositorySecrets.join(', ') : '(none detected)'}`,
        `Organization Secrets available here: ${remote.organizationSecrets.length > 0 ? remote.organizationSecrets.join(', ') : '(none detected)'}`,
        `Repository Variables: ${remote.repositoryVariables.length > 0 ? remote.repositoryVariables.map(variable => variable.name).join(', ') : '(none detected)'}`,
        `Organization Variables available here: ${remote.organizationVariables.length > 0 ? remote.organizationVariables.map(variable => variable.name).join(', ') : '(none detected)'}`,
        `Required Secrets: ${requirements.map(requirement => requirement.name).join(', ')}`,
        `Required Variables: ${variables.map(variable => variable.name).join(', ')}`,
        remote.organizationAccess === 'available'
            ? 'Organization resources can be inspected for this repository.'
            : `Organization resource inspection: ${remote.organizationAccess}.`,
        'Repository-level resources take precedence over organization-level resources. Secret values are never displayed.',
    ];
    return lines.join('\n');
}

function stripAnsi(value: string): string {
    return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');
}
