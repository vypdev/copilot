import type { SetupWorkflowPatStorageNotice } from '../domain/setup';

export function workflowPatStorageCopy(storage: SetupWorkflowPatStorageNotice): string {
    return [
        storage.replacesExisting
            ? `Secret PAT already exists in ${storage.scope} ${storage.destination}. It will be replaced even when other existing Secrets are preserved.`
            : `The bot PAT will be stored as Secret PAT in ${storage.scope} ${storage.destination}.`,
        'The supplied bot PAT must pass identity, repository access and required permission checks before this Secret is written.',
        ...(storage.scope === 'organization' && storage.replacesExisting
            ? ['Replacing this organization Secret can affect other repositories that use it. Checks for this repository do not verify their requirements.'] : []),
    ].join('\n');
}
