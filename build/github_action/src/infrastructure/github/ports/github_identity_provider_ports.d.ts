export interface GithubRepositoryContextClient {
    context: {
        repo: {
            owner: string;
        };
    };
}
export interface GithubOwnerTypeClient {
    rest: {
        users: {
            getByUsername(parameters: {
                username: string;
            }): Promise<{
                data: {
                    type?: string;
                };
            }>;
        };
    };
}
