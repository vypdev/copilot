export interface ActorAuthorizationPort {
    isActorAllowedToModifyFiles(owner: string, actor: string, token: string): Promise<boolean>;
}
