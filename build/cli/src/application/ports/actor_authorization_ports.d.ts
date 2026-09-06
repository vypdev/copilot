export interface ActorAuthorizationPort {
    isActorAllowedToModifyFiles(owner: string, repository: string, actor: string, token: string): Promise<boolean>;
}
