export interface ActorAuthorizationPort {
    isActorAllowedToModifyFiles(owner: string, repository: string, actor: string, token: string): Promise<boolean>;
}

/** Repository-credential-bound actor authorization for comment routes. */
export interface BoundActorAuthorizationPort {
    isActorAllowedToModifyFiles(actor: string): Promise<boolean>;
}
