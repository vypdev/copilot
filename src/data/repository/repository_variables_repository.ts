import type { SetupVariablesWriteResult } from '../../domain/setup';
import type {
    SetupRemoteConfigurationReadPort,
    SetupRepositoryVariablesQueryPort,
    SetupRepositorySecretNamesQueryPort,
    SetupRepositorySecretsCommandPort,
    SetupRepositoryVariablesCommandPort,
} from '../../application/ports/setup_wizard_ports';
import type { SetupCredentialValue, SetupRemoteConfiguration, SetupResourceTarget, SetupVariable } from '../../domain/setup';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import type { GithubRepositoryVariablesClient } from '../../infrastructure/github/ports/github_repository_variables_protocol';
import { GithubActionsResourceInspector } from './github/github_actions_resource_inspector';
import { GithubActionsResourceCommands } from './github/github_actions_resource_commands';


/** Read-only repository Secret metadata boundary. Secret values are never available. */
export class RepositorySecretNamesQueryRepository implements SetupRepositorySecretNamesQueryPort {
    private readonly transport: GithubActionsResourceInspector;

    constructor(githubClient: GithubClientPort<GithubRepositoryVariablesClient>) {
        this.transport = new GithubActionsResourceInspector(githubClient);
    }

    list(owner: string, repository: string, token: string): Promise<readonly string[]> {
        return this.transport.list(owner, repository, token);
    }
}


/** Read-only repository Variable metadata boundary. */
export class RepositoryVariablesQueryRepository implements SetupRepositoryVariablesQueryPort {
    private readonly transport: GithubActionsResourceInspector;

    constructor(githubClient: GithubClientPort<GithubRepositoryVariablesClient>) {
        this.transport = new GithubActionsResourceInspector(githubClient);
    }

    listVariables(owner: string, repository: string, token: string): Promise<readonly { name: string; value?: string }[]> {
        return this.transport.listVariables(owner, repository, token);
    }
}


/** Read-only aggregate of GitHub Actions resource facts used by setup and doctor policy. */
export class SetupRemoteConfigurationQueryRepository implements SetupRemoteConfigurationReadPort {
    private readonly transport: GithubActionsResourceInspector;

    constructor(githubClient: GithubClientPort<GithubRepositoryVariablesClient>) {
        this.transport = new GithubActionsResourceInspector(githubClient);
    }

    inspect(owner: string, repository: string, token: string): Promise<SetupRemoteConfiguration> {
        return this.transport.inspect(owner, repository, token);
    }

    inspectCredentialHealthWorkflow(owner: string, repository: string, token: string, ref: string) {
        return this.transport.inspectCredentialHealthWorkflow(owner, repository, token, ref);
    }
}


/** Variable mutation boundary used only by setup application. */
export class RepositoryVariablesCommandRepository implements SetupRepositoryVariablesCommandPort {
    private readonly transport: GithubActionsResourceCommands;

    constructor(githubClient: GithubClientPort<GithubRepositoryVariablesClient>) {
        this.transport = new GithubActionsResourceCommands(githubClient);
    }

    upsert(
        owner: string,
        repository: string,
        token: string,
        variables: readonly { name: string; value: string }[],
    ): Promise<SetupVariablesWriteResult> {
        return this.transport.upsert(owner, repository, token, variables);
    }

    upsertScopedVariables(
        owner: string,
        repository: string,
        token: string,
        target: SetupResourceTarget,
        variables: readonly SetupVariable[],
    ): Promise<SetupVariablesWriteResult> {
        return this.transport.upsertScopedVariables(owner, repository, token, target, variables);
    }
}


/** Secret mutation boundary used only by setup application. */
export class RepositorySecretsCommandRepository implements SetupRepositorySecretsCommandPort {
    private readonly transport: GithubActionsResourceCommands;

    constructor(githubClient: GithubClientPort<GithubRepositoryVariablesClient>) {
        this.transport = new GithubActionsResourceCommands(githubClient);
    }

    upsertSecrets(
        owner: string,
        repository: string,
        token: string,
        credentials: readonly SetupCredentialValue[],
    ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
        return this.transport.upsertSecrets(owner, repository, token, credentials);
    }

    upsertScopedSecrets(
        owner: string,
        repository: string,
        token: string,
        target: SetupResourceTarget,
        credentials: readonly SetupCredentialValue[],
    ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
        return this.transport.upsertScopedSecrets(owner, repository, token, target, credentials);
    }
}
