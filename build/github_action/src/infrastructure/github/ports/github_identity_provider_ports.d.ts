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
