export interface PublicationSourceQueryPort {
    getBranchHeadSha(owner: string, repository: string, branch: string, token: string): Promise<string>;
}

/** Repository-credential-bound authoritative source lookup for publication guards. */
export interface BoundPublicationSourceQueryPort {
    getBranchHeadSha(branch: string): Promise<string>;
}
