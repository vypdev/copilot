export interface GithubClientPort<Client> {
    getClient(token: string): Client;
}
