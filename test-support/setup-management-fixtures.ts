import type { SetupRemoteConfiguration } from '../src/domain/setup';
import type { SetupInstallation } from '../src/domain/setup_management';
type Mutable<T> = T extends readonly (infer V)[] ? Mutable<V>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
export function localInstallation(): Mutable<SetupInstallation> {
 return { revision: 'checkout-a', guidancePresent: true, unreadable: false, workflows: [{ file: 'copilot_commit.yml', action: 'vypdev/copilot@v3', digest: 'file-a', environmentScoped: false,
 inputs: [{ name: 'bugbot-comment-limit', variable: 'BUGBOT_COMMENT_LIMIT', fallback: '20' }] }] };
}
export function remoteConfiguration(): SetupRemoteConfiguration {
 return { ownerType: 'Organization', repositoryId: 1, repositoryVisibility: 'public', repositorySecrets: [], repositorySecretsAccess: 'available', organizationSecrets: ['PAT'], organizationSecretsAccess: 'available', organizationWorkflowPat: 'present', repositoryVariables: [], repositoryVariablesAccess: 'available', organizationVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: '20' }, { name: 'UNRELATED', value: 'keep-me' }], organizationVariablesAccess: 'available', organizationAccess: 'available' };
}
