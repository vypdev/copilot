export interface GithubIssueAdmissionClient {
    rest: {
        users: { getAuthenticated(): Promise<{ data: unknown }> };
        issues: { get(parameters: { owner: string; repo: string; issue_number: number }): Promise<{ data: unknown }> };
        actions: {
            listArtifactsForRepo(parameters: { owner: string; repo: string; name: string; per_page: number }): Promise<{ data: unknown }>;
            getWorkflowRun(parameters: { owner: string; repo: string; run_id: number }): Promise<{ data: unknown }>;
        };
    };
}
