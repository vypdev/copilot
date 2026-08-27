import * as github from '@actions/github';

export function getOctokitClient<TClient>(token: string): TClient {
    return github.getOctokit(token) as unknown as TClient;
}
